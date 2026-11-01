import { fileURLToPath } from 'node:url';
import { Stack, TimeZone, Validations } from 'aws-cdk-lib';
import type { CfnFunction } from 'aws-cdk-lib/aws-lambda';
import { Schedule, ScheduleExpression } from 'aws-cdk-lib/aws-scheduler';
import { LambdaInvoke } from 'aws-cdk-lib/aws-scheduler-targets';
import type { IQueue } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import { MATCH_CHECK_FUNCTION_VARIABLE } from '../src/scheduling/environment.js';
import type { MatchCheckSchedules } from './match-check-schedules.js';
import { PipelineFunction } from './pipeline-function.js';
import { createSchedulerInvokeRole } from './scheduler-invoke-role.js';

const HANDLER_ENTRY = fileURLToPath(new URL('../src/planner/handler.ts', import.meta.url));
// One page at 10 s, plus one CreateSchedule call per match (about fifteen on a busy day).
const TIMEOUT_SECONDS = 30;
// Same base as fetch-results (Node runtime, AWS SDK client, one page parsed).
const MEMORY_SIZE_MB = 256;
/** 10:00 in Paris: the page of the day has had time to fill in, and quiet hours are over (D4). */
const PLANNER_HOUR = '10';

export interface PlannerFunctionProps {
  readonly matchChecks: MatchCheckSchedules;
  readonly failureQueue: IQueue;
}

/** The planner Lambda, run every morning: it may only read the page and schedule match checks. */
export class PlannerFunction extends PipelineFunction {
  constructor(scope: Construct, id: string, props: PlannerFunctionProps) {
    super(scope, id, {
      entry: HANDLER_ENTRY,
      roleDescription: 'planner Lambda: write its logs and schedule match checks',
      timeoutSeconds: TIMEOUT_SECONDS,
      memorySizeMb: MEMORY_SIZE_MB,
      environment: { [MATCH_CHECK_FUNCTION_VARIABLE]: props.matchChecks.checkFunctionArn },
      failureQueue: props.failureQueue,
    });
    props.matchChecks.allowScheduleChecks(this);
    this.addMorningSchedule(props.failureQueue);
  }

  /**
   * In the default group, so the planner's rights on the match check group never reach its own trigger.
   * A run Scheduler cannot invoke goes to the failure queue (D37).
   */
  private addMorningSchedule(failureQueue: IQueue): void {
    const role = createSchedulerInvokeRole(this, 'MorningScheduleRole', 'EventBridge Scheduler: run the planner');
    new Schedule(this, 'MorningSchedule', {
      description: 'Run the planner every morning (Paris time)',
      schedule: ScheduleExpression.cron({ minute: '0', hour: PLANNER_HOUR, timeZone: TimeZone.EUROPE_PARIS }),
      target: new LambdaInvoke(this.lambdaFunction, { role, deadLetterQueue: failureQueue }),
    });
    const functionLogicalId: unknown = Stack.of(this).resolve((this.lambdaFunction.node.defaultChild as CfnFunction).logicalId);
    Validations.of(role).acknowledge({
      id: `AwsSolutions::AwsSolutions-IAM5[Resource::<${String(functionLogicalId)}.Arn>:*]`,
      reason:
        'The CDK Lambda target grants invoke on the planner and its versions and aliases (`:*`): ' +
        'the wildcard never reaches another function.',
    });
  }
}
