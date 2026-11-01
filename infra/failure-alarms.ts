import { Duration, Stack, Validations } from 'aws-cdk-lib';
import { Alarm, ComparisonOperator, type IMetric, Stats, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import { FilterPattern, type ILogGroup, MetricFilter } from 'aws-cdk-lib/aws-logs';
import { Topic } from 'aws-cdk-lib/aws-sns';
import type { IQueue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { MATCH_GIVEN_UP_MESSAGE, type MatchStatus } from '../src/fetch-results/check-match.js';

/** The email subscription is added by hand once the topic exists, so the address never enters the public repo (D38). */
export const ALERT_TOPIC_NAME = 'final-whistle-alerts';
const ALARM_NAME_PREFIX = 'final-whistle-';
const METRIC_NAMESPACE = 'FinalWhistle';
const MATCH_NOT_FOUND_METRIC = 'MatchGivenUpNotFound';
/** SQS publishes its queue metrics every few minutes. */
const FAILURE_QUEUE_PERIOD_MINUTES = 5;
const FAILURE_QUEUE_PERIOD = Duration.minutes(FAILURE_QUEUE_PERIOD_MINUTES);
const MATCH_NOT_FOUND_PERIOD = Duration.hours(1);
const PLANNER_RUN_PERIOD = Duration.hours(1);
/** The planner runs every 24 h (25 h when the clocks go back): 26 empty hours mean it did not run. */
const PLANNER_SILENT_HOURS = 26;
/** A match still not found when given up; `not-finished` is a postponed or abandoned match, not a failure. */
const NOT_FOUND_STATUS: MatchStatus = 'not-found';

export interface FailureAlarmsProps {
  readonly failureQueue: IQueue;
  /** The log group of fetch-results, where a match given up is logged. */
  readonly matchCheckLogGroup: ILogGroup;
  readonly planner: IFunction;
}

interface AlarmDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly metric: IMetric;
  readonly comparisonOperator: ComparisonOperator;
  readonly evaluationPeriods: number;
  readonly treatMissingData: TreatMissingData;
}

/**
 * The alarms of the pipeline (D39): they watch for a failure of the system, never for a missing score,
 * and notify the alert topic (D38).
 */
export class FailureAlarms extends Construct {
  private readonly topic: Topic;

  constructor(scope: Construct, id: string, props: FailureAlarmsProps) {
    super(scope, id);
    this.topic = createAlertTopic(this);
    this.addFailureQueueAlarm(props.failureQueue);
    this.addMatchNotFoundAlarm(props.matchCheckLogGroup);
    this.addPlannerNotRunAlarm(props.planner);
  }

  /**
   * Counts arrivals rather than the messages waiting: each new failure raises a new alert, even while
   * an earlier one is still in the queue, and the alarm returns to OK on its own.
   */
  private addFailureQueueAlarm(failureQueue: IQueue): void {
    this.addAlarm({
      id: 'FailureQueueAlarm',
      name: 'failure-queue-message-sent',
      description: 'A failed invocation or an undelivered event was sent to the failure queue.',
      metric: failureQueue.metricNumberOfMessagesSent({ period: FAILURE_QUEUE_PERIOD, statistic: Stats.SUM }),
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
  }

  /** A match the planner found but fetch-results never found again on the page: most likely a lookup problem (D39). */
  private addMatchNotFoundAlarm(logGroup: ILogGroup): void {
    const filter = new MetricFilter(this, 'MatchNotFoundFilter', {
      logGroup,
      filterPattern: FilterPattern.all(
        FilterPattern.stringValue('$.message', '=', MATCH_GIVEN_UP_MESSAGE),
        FilterPattern.stringValue('$.status', '=', NOT_FOUND_STATUS),
      ),
      metricNamespace: METRIC_NAMESPACE,
      metricName: MATCH_NOT_FOUND_METRIC,
      metricValue: '1',
    });
    this.addAlarm({
      id: 'MatchNotFoundAlarm',
      name: 'match-not-found',
      description: 'A match was given up because it was never found on the source page.',
      metric: filter.metric({ period: MATCH_NOT_FOUND_PERIOD, statistic: Stats.SUM }),
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
  }

  /** No run at all leaves no error to catch: an hour without invocations counts as breaching. */
  private addPlannerNotRunAlarm(planner: IFunction): void {
    this.addAlarm({
      id: 'PlannerNotRunAlarm',
      name: 'planner-not-run',
      description: `The planner has not run for ${String(PLANNER_SILENT_HOURS)} hours.`,
      metric: planner.metricInvocations({ period: PLANNER_RUN_PERIOD, statistic: Stats.SUM }),
      comparisonOperator: ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: PLANNER_SILENT_HOURS,
      treatMissingData: TreatMissingData.BREACHING,
    });
  }

  /** Every alarm fires at a threshold of 1 and notifies the topic when it goes to ALARM. */
  private addAlarm(definition: AlarmDefinition): void {
    const alarm = new Alarm(this, definition.id, {
      alarmName: `${ALARM_NAME_PREFIX}${definition.name}`,
      alarmDescription: definition.description,
      metric: definition.metric,
      threshold: 1,
      comparisonOperator: definition.comparisonOperator,
      evaluationPeriods: definition.evaluationPeriods,
      treatMissingData: definition.treatMissingData,
    });
    alarm.addAlarmAction(new SnsAction(this.topic));
  }
}

/** HTTPS only; CloudWatch alarms of this account may publish on it. */
function createAlertTopic(scope: Construct): Topic {
  const topic = new Topic(scope, 'AlertTopic', { topicName: ALERT_TOPIC_NAME, enforceSSL: true });
  topic.grantPublish(
    new ServicePrincipal('cloudwatch.amazonaws.com', {
      conditions: { StringEquals: { 'aws:SourceAccount': Stack.of(scope).account } },
    }),
  );
  Validations.of(topic).acknowledge({
    id: 'AwsSolutions::AwsSolutions-SNS2',
    reason:
      'CloudWatch alarms cannot publish on a topic encrypted with the AWS-managed SNS key, and a customer-managed KMS key ' +
      'is billed (D17). The topic only carries alarm states, no secret and no score.',
  });
  return topic;
}
