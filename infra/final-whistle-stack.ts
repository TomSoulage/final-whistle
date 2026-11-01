import { Stack, type StackProps } from 'aws-cdk-lib';
import { EventBus } from 'aws-cdk-lib/aws-events';
import type { Construct } from 'constructs';
import { createFailureQueue } from './failure-queue.js';
import { FetchResultsFunction } from './fetch-results-function.js';
import { MatchCheckSchedules } from './match-check-schedules.js';
import { NotifyFunction } from './notify-function.js';
import { PlannerFunction } from './planner-function.js';
import { createSentMatchesTable } from './sent-matches-table.js';

export const EVENT_BUS_NAME = 'final-whistle';

/** Application stack: the Lambdas, bus, table and alarms are added to it step by step. */
export class FinalWhistleStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const failureQueue = createFailureQueue(this);
    // Created with its producer; consumers subscribe with their own rules (D6).
    const eventBus = new EventBus(this, 'EventBus', { eventBusName: EVENT_BUS_NAME });
    const fetchResults = new FetchResultsFunction(this, 'FetchResults', { eventBus, failureQueue });
    const matchChecks = new MatchCheckSchedules(this, 'MatchChecks', {
      checkFunction: fetchResults.lambdaFunction,
      failureQueue,
    });
    // A check that finds no score schedules the next attempt itself (D35).
    matchChecks.allowScheduleChecks(fetchResults);
    new PlannerFunction(this, 'Planner', { matchChecks, failureQueue });
    new NotifyFunction(this, 'Notify', { eventBus, sentMatches: createSentMatchesTable(this), failureQueue });
  }
}
