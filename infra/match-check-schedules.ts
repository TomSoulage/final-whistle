import { ArnFormat, Stack, Validations } from 'aws-cdk-lib';
import { PolicyStatement, type Role } from 'aws-cdk-lib/aws-iam';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import { ScheduleGroup } from 'aws-cdk-lib/aws-scheduler';
import { Construct } from 'constructs';
import {
  MATCH_CHECK_FUNCTION_VARIABLE,
  MATCH_CHECK_GROUP_VARIABLE,
  MATCH_CHECK_ROLE_VARIABLE,
} from '../src/scheduling/environment.js';
import type { PipelineFunction } from './pipeline-function.js';
import { createSchedulerInvokeRole, SCHEDULER_SERVICE } from './scheduler-invoke-role.js';

const MATCH_CHECK_GROUP_NAME = 'final-whistle-match-checks';

export interface MatchCheckSchedulesProps {
  /** The fetch-results function each match check invokes. */
  readonly checkFunction: IFunction;
}

/**
 * The one-time match checks (D4): their schedule group, and the role Scheduler invokes fetch-results with.
 * Lambdas allowed to schedule checks may only create schedules in this group, with this role.
 */
export class MatchCheckSchedules extends Construct {
  /** Where a check goes, for the environment of a Lambda that schedules checks. */
  readonly environment: Readonly<Record<string, string>>;
  private readonly invokeRole: Role;

  constructor(scope: Construct, id: string, props: MatchCheckSchedulesProps) {
    super(scope, id);
    new ScheduleGroup(this, 'Group', { scheduleGroupName: MATCH_CHECK_GROUP_NAME });
    this.invokeRole = createSchedulerInvokeRole(
      this,
      'InvokeRole',
      'EventBridge Scheduler: invoke fetch-results for a match check',
    );
    this.invokeRole.addToPolicy(
      new PolicyStatement({ actions: ['lambda:InvokeFunction'], resources: [props.checkFunction.functionArn] }),
    );
    this.environment = {
      [MATCH_CHECK_GROUP_VARIABLE]: MATCH_CHECK_GROUP_NAME,
      [MATCH_CHECK_FUNCTION_VARIABLE]: props.checkFunction.functionArn,
      [MATCH_CHECK_ROLE_VARIABLE]: this.invokeRole.roleArn,
    };
  }

  /** Allows creating schedules in the group only, and passing the invoke role to Scheduler only. */
  grantScheduleChecks(pipelineFunction: PipelineFunction): void {
    const { lambdaFunction } = pipelineFunction;
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
        'Each match check gets its own schedule, named at run time from the match id, so the names cannot be ' +
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
