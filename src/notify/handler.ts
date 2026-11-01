import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SSMClient } from '@aws-sdk/client-ssm';
import { getRequiredEnv } from '../shared/get-required-env.js';
import { createLogger, type LogFields } from '../shared/logger.js';
import { readOnce } from '../shared/read-once.js';
import {
  BOT_TOKEN_PARAMETER_VARIABLE,
  CHAT_ID_PARAMETER_VARIABLE,
  SENT_MATCHES_TABLE_VARIABLE,
} from './environment.js';
import { notifyMatch, type NotifyStatus } from './notify-match.js';
import { isAlreadySent, rememberSent } from './sent-matches.js';
import { sendTelegramMessage } from './telegram.js';
import { readTelegramChat } from './telegram-chat-parameters.js';

const SERVICE_NAME = 'notify';

/** Read once, at cold start. */
const tableName = getRequiredEnv(SENT_MATCHES_TABLE_VARIABLE);
const parameterNames = {
  botToken: getRequiredEnv(BOT_TOKEN_PARAMETER_VARIABLE),
  chatId: getRequiredEnv(CHAT_ID_PARAMETER_VARIABLE),
};
const dynamoDb = new DynamoDBClient({});
const ssm = new SSMClient({});
/** The token stays in memory between invocations of the same instance (D12). */
const getTelegramChat = readOnce(() => readTelegramChat((command) => ssm.send(command), parameterNames));

/** notify Lambda: only wires DynamoDB, Parameter Store, Telegram and the logs to `notifyMatch`. */
export async function handler(event: unknown): Promise<{ readonly status: NotifyStatus }> {
  const status = await notifyMatch(event, {
    isAlreadySent: (matchId) => isAlreadySent((command) => dynamoDb.send(command), tableName, matchId),
    sendMessage: async (text, matchId) => sendTelegramMessage(fetch, await getTelegramChat(), text, matchId),
    rememberSent: (matchId) => rememberSent((command) => dynamoDb.send(command), tableName, matchId, new Date()),
    createLogger: (context: LogFields) => createLogger({ service: SERVICE_NAME, ...context }),
  });
  return { status };
}
