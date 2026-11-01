import { Stack, type StackProps } from 'aws-cdk-lib';
import { EventBus } from 'aws-cdk-lib/aws-events';
import type { Construct } from 'constructs';
import { FetchResultsFunction } from './fetch-results-function.js';
import { NotifyFunction } from './notify-function.js';
import { createSentMatchesTable } from './sent-matches-table.js';

export const EVENT_BUS_NAME = 'final-whistle';

/** Application stack: the Lambdas, bus, table and alarms are added to it step by step. */
export class FinalWhistleStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    // Created with its producer; consumers subscribe with their own rules (D6).
    const eventBus = new EventBus(this, 'EventBus', { eventBusName: EVENT_BUS_NAME });
    new FetchResultsFunction(this, 'FetchResults', { eventBus });
    new NotifyFunction(this, 'Notify', { eventBus, sentMatches: createSentMatchesTable(this) });
  }
}
