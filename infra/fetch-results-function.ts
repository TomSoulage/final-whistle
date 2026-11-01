import { fileURLToPath } from 'node:url';
import type { EventBus } from 'aws-cdk-lib/aws-events';
import type { IQueue } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import { EVENT_BUS_NAME_VARIABLE } from '../src/fetch-results/environment.js';
import { PipelineFunction } from './pipeline-function.js';

const HANDLER_ENTRY = fileURLToPath(new URL('../src/fetch-results/handler.ts', import.meta.url));
// Up to two pages at 10 s each, plus parsing, then publishing or scheduling the next attempt.
const TIMEOUT_SECONDS = 30;
// The default 128 MB peaked at 120 MB on a real run (Node runtime, SDK, two pages). Parsing itself
// holds a few MB even for a page ten times larger, so 256 MB leaves a wide margin, and more CPU.
const MEMORY_SIZE_MB = 256;

export interface FetchResultsFunctionProps {
  readonly eventBus: EventBus;
  readonly failureQueue: IQueue;
}

/** The fetch-results Lambda: on top of its logs, it may only publish on the bus (and schedule its next attempt, see the stack). */
export class FetchResultsFunction extends PipelineFunction {
  constructor(scope: Construct, id: string, props: FetchResultsFunctionProps) {
    super(scope, id, {
      entry: HANDLER_ENTRY,
      roleDescription: 'fetch-results Lambda: write its logs, publish MatchFinished and schedule its next attempt',
      timeoutSeconds: TIMEOUT_SECONDS,
      memorySizeMb: MEMORY_SIZE_MB,
      environment: { [EVENT_BUS_NAME_VARIABLE]: props.eventBus.eventBusName },
      failureQueue: props.failureQueue,
    });
    props.eventBus.grantPutEventsTo(this.lambdaFunction);
  }
}
