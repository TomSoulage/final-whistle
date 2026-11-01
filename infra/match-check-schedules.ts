import { ArnFormat, Stack, Validations } from 'aws-cdk-lib';
import { PolicyStatement, type Role } from 'aws-cdk-lib/aws-iam';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import { ScheduleGroup } from 'aws-cdk-lib/aws-scheduler';
import type { IQueue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import {
  MATCH_CHECK_DEAD_LETTER_QUEUE_VARIABLE,
  MATCH_CHECK_GROUP_VARIABLE,
  MATCH_CHECK_ROLE_VARIABLE,
} from '../src/scheduling/environment.js';
import type { PipelineFunction } from './pipeline-function.js';
import { createSchedulerInvokeRole, SCHEDULER_SERVICE } from './scheduler-invoke-role.js';

const MATCH_CHECK_GROUP_NAME = 'final-whistle-match-checks';

export interface MatchCheckSchedulesProps {
  /** The fetch-results function each match check invokes. */
  readonly checkFunction: IFunction;
  /** Where Scheduler sends a match check it cannot invoke fetch-results with (D37). */
  readonly failureQueue: IQueue;
}

/**
 * The one-time match checks (D4): their schedule group, the role Scheduler invokes fetch-results with,
 * and the dead-letter queue it sends a check to when that invocation fails.
 * Lambdas allowed to schedule checks may only create schedules in this group, with this role.
 */
export class MatchCheckSchedules extends Construct {
  /** The fetch-results function each match check invokes. */
  readonly checkFunctionArn: string;
  private readonly invokeRole: Role;
  private readonly failureQueueArn: string;

  constructor(scope: Construct, id: string, props: MatchCheckSchedulesProps) {
    super(scope, id);
    new ScheduleGroup(this, 'Group', { scheduleGroupName: MATCH_CHECK_GROUP_NAME });
    this.invokeRole = createSchedulerInvokeRole(
      this,
      'InvokeRole',
      'EventBridge Scheduler: invoke fetch-results for a match check, or send the check to the failure queue',
    );
    this.invokeRole.addToPolicy(
      new PolicyStatement({ actions: ['lambda:InvokeFunction'], resources: [props.checkFunction.functionArn] }),
    );
    this.invokeRole.addToPolicy(
      new PolicyStatement({ actions: ['sqs:SendMessage'], resources: [props.failureQueue.queueArn] }),
    );
    this.checkFunctionArn = props.checkFunction.functionArn;
    this.failureQueueArn = props.failureQueue.queueArn;
  }

  /**
   * Lets a Lambda schedule match checks: the group, invoke role and queue go into its environment, and it may
   * only create schedules in that group and pass that role to Scheduler.
   */
  allowScheduleChecks(pipelineFunction: PipelineFunction): void {
    const { lambdaFunction } = pipelineFunction;
    lambdaFunction.addEnvironment(MATCH_CHECK_GROUP_VARIABLE, MATCH_CHECK_GROUP_NAME);
    lambdaFunction.addEnvironment(MATCH_CHECK_ROLE_VARIABLE, this.invokeRole.roleArn);
    lambdaFunction.addEnvironment(MATCH_CHECK_DEAD_LETTER_QUEUE_VARIABLE, this.failureQueueArn);
    lambdaFunction.addToRolePolicy(
      new PolicyStatement({ actions: ['scheduler:CreateSchedule'], resources: [this.getSchedulesInGroupArn()] }),
    );
    lambdaFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [this.invokeRole.roleArn],
        conditions: { StringEquals: { 'iam:PassedToService': SCHEDULER_SERVICE } },
      }),
    );
    Validations.of(pipelineFunction).acknowledge({
      id: `AwsSolutions::AwsSolutions-IAM5[Resource::arn:<AWS::Partition>:scheduler:<AWS::Region>:<AWS::AccountId>:schedule/${MATCH_CHECK_GROUP_NAME}/*]`,
      reason:
        'Each match check gets its own schedule, named at run time from the match id and attempt, so the names cannot be ' +
        'listed in advance; the wildcard is limited to the match check group and to CreateSchedule.',
    });
  }

  private getSchedulesInGroupArn(): string {
    return Stack.of(this).formatArn({
      service: 'scheduler',
      resource: 'schedule',
      resourceName: `${MATCH_CHECK_GROUP_NAME}/*`,
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
    });
  }
}
