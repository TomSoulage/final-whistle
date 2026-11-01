import { Stack } from 'aws-cdk-lib';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export const SCHEDULER_SERVICE = 'scheduler.amazonaws.com';

/** A role for EventBridge Scheduler that only schedules of this account may use (confused deputy). */
export function createSchedulerInvokeRole(scope: Construct, id: string, description: string): Role {
  return new Role(scope, id, {
    assumedBy: new ServicePrincipal(SCHEDULER_SERVICE, {
      conditions: { StringEquals: { 'aws:SourceAccount': Stack.of(scope).account } },
    }),
    description,
  });
}
