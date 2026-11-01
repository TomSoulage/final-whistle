import { fileURLToPath } from 'node:url';
import { Duration } from 'aws-cdk-lib';
import type { EventBus } from 'aws-cdk-lib/aws-events';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EVENT_BUS_NAME_VARIABLE } from '../src/fetch-results/environment.js';

const HANDLER_ENTRY = fileURLToPath(new URL('../src/fetch-results/handler.ts', import.meta.url));
// Up to two pages at 10 s each, plus parsing and publishing.
const TIMEOUT_SECONDS = 30;
// The default 128 MB peaked at 120 MB on a real run (Node runtime, SDK, two pages). Parsing itself
// holds a few MB even for a page ten times larger, so 256 MB leaves a wide margin, and more CPU.
const MEMORY_SIZE_MB = 256;
export const LOG_RETENTION = RetentionDays.ONE_MONTH;

export interface FetchResultsFunctionProps {
  readonly eventBus: EventBus;
}

/** The fetch-results Lambda, with its own least-privilege role and its own log group. */
export class FetchResultsFunction extends Construct {
  readonly lambdaFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: FetchResultsFunctionProps) {
    super(scope, id);
    const logGroup = new LogGroup(this, 'LogGroup', { retention: LOG_RETENTION });
    const role = new Role(this, 'Role', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      description: 'fetch-results Lambda: write its logs and publish MatchFinished',
    });
    role.addToPolicy(
      new PolicyStatement({
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [logGroup.logGroupArn],
      }),
    );
    this.lambdaFunction = new NodejsFunction(this, 'Function', {
      entry: HANDLER_ENTRY,
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(TIMEOUT_SECONDS),
      memorySize: MEMORY_SIZE_MB,
      role,
      logGroup,
      environment: { [EVENT_BUS_NAME_VARIABLE]: props.eventBus.eventBusName },
    });
    props.eventBus.grantPutEventsTo(this.lambdaFunction);
  }
}
