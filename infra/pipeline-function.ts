import { Duration } from 'aws-cdk-lib';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

const LOG_RETENTION = RetentionDays.ONE_MONTH;

export interface PipelineFunctionProps {
  /** Absolute path of the handler file. */
  readonly entry: string;
  /** What the role allows, e.g. `fetch-results Lambda: write its logs and publish MatchFinished`. */
  readonly roleDescription: string;
  readonly timeoutSeconds: number;
  readonly memorySizeMb: number;
  readonly environment: Readonly<Record<string, string>>;
}

/**
 * A pipeline Lambda: Node.js 24 on arm64, its own log group with a retention, and its own role
 * that can only write to that log group. Each Lambda adds the few permissions it needs (least privilege).
 */
export class PipelineFunction extends Construct {
  readonly lambdaFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: PipelineFunctionProps) {
    super(scope, id);
    const logGroup = new LogGroup(this, 'LogGroup', { retention: LOG_RETENTION });
    const role = new Role(this, 'Role', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      description: props.roleDescription,
    });
    role.addToPolicy(
      new PolicyStatement({
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [logGroup.logGroupArn],
      }),
    );
    this.lambdaFunction = new NodejsFunction(this, 'Function', {
      entry: props.entry,
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(props.timeoutSeconds),
      memorySize: props.memorySizeMb,
      role,
      logGroup,
      environment: { ...props.environment },
    });
  }
}
