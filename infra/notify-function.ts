import { fileURLToPath } from 'node:url';
import { ArnFormat, Stack } from 'aws-cdk-lib';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import { type EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { MATCH_FINISHED_DETAIL_TYPE, MATCH_FINISHED_SOURCE } from '../src/events/match-finished.js';
import {
  BOT_TOKEN_PARAMETER_VARIABLE,
  CHAT_ID_PARAMETER_VARIABLE,
  SENT_MATCHES_TABLE_VARIABLE,
} from '../src/notify/environment.js';
import { PipelineFunction } from './pipeline-function.js';

const HANDLER_ENTRY = fileURLToPath(new URL('../src/notify/handler.ts', import.meta.url));
// Parameter Store, two DynamoDB calls and Telegram, whose request is cut after 10 s.
const TIMEOUT_SECONDS = 20;
// Same base as fetch-results (Node runtime and AWS SDK clients), whose 128 MB default peaked at 120 MB.
const MEMORY_SIZE_MB = 256;

/** Created by hand before the first deployment: CloudFormation cannot create a SecureString (D12). */
export const TELEGRAM_PARAMETER_NAMES = {
  botToken: '/final-whistle/telegram/bot-token',
  chatId: '/final-whistle/telegram/chat-id',
} as const;

export interface NotifyFunctionProps {
  readonly eventBus: EventBus;
  readonly sentMatches: Table;
}

/** The notify Lambda, subscribed to MatchFinished by its own rule (D6), with access to its table and parameters only. */
export class NotifyFunction extends PipelineFunction {
  constructor(scope: Construct, id: string, props: NotifyFunctionProps) {
    super(scope, id, {
      entry: HANDLER_ENTRY,
      roleDescription: 'notify Lambda: write its logs, read the Telegram parameters, check and record sent scores',
      timeoutSeconds: TIMEOUT_SECONDS,
      memorySizeMb: MEMORY_SIZE_MB,
      environment: {
        [SENT_MATCHES_TABLE_VARIABLE]: props.sentMatches.tableName,
        [BOT_TOKEN_PARAMETER_VARIABLE]: TELEGRAM_PARAMETER_NAMES.botToken,
        [CHAT_ID_PARAMETER_VARIABLE]: TELEGRAM_PARAMETER_NAMES.chatId,
      },
    });
    this.allowSentMatchesAccess(props.sentMatches);
    this.allowTelegramParametersRead();
    new Rule(this, 'MatchFinishedRule', {
      eventBus: props.eventBus,
      eventPattern: { source: [MATCH_FINISHED_SOURCE], detailType: [MATCH_FINISHED_DETAIL_TYPE] },
      targets: [new LambdaFunction(this.lambdaFunction)],
    });
  }

  private allowSentMatchesAccess(table: Table): void {
    this.lambdaFunction.addToRolePolicy(
      new PolicyStatement({ actions: ['dynamodb:GetItem', 'dynamodb:PutItem'], resources: [table.tableArn] }),
    );
  }

  /** The AWS-managed key lets SSM decrypt for the account's roles: no KMS permission is granted. */
  private allowTelegramParametersRead(): void {
    const stack = Stack.of(this);
    const parameterArns = Object.values(TELEGRAM_PARAMETER_NAMES).map((name) =>
      stack.formatArn({
        service: 'ssm',
        resource: 'parameter',
        resourceName: name.slice(1),
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      }),
    );
    this.lambdaFunction.addToRolePolicy(new PolicyStatement({ actions: ['ssm:GetParameters'], resources: parameterArns }));
  }
}
