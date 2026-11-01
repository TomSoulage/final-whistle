import { GetParametersCommand, type GetParametersCommandOutput } from '@aws-sdk/client-ssm';
import type { TelegramChat } from './telegram.js';

export type SendGetParameters = (command: GetParametersCommand) => Promise<GetParametersCommandOutput>;

export interface TelegramChatParameterNames {
  readonly botToken: string;
  readonly chatId: string;
}

/**
 * Reads the bot token (SecureString) and the chat id from Parameter Store in one call (D12).
 * SSM does not throw for a missing parameter, it lists it in `InvalidParameters`: that is turned
 * into an error naming it. The values themselves are never logged.
 */
export async function readTelegramChat(
  sendGetParameters: SendGetParameters,
  names: TelegramChatParameterNames,
): Promise<TelegramChat> {
  const command = new GetParametersCommand({ Names: [names.botToken, names.chatId], WithDecryption: true });
  const output = await sendGetParameters(command).catch((error: unknown) => {
    throw new Error(`Cannot read the Telegram parameters ${names.botToken} and ${names.chatId}`, { cause: error });
  });
  const missing = output.InvalidParameters ?? [];
  if (missing.length > 0) {
    throw new Error(`Telegram parameters missing from Parameter Store: ${missing.join(', ')}`);
  }
  return { botToken: getValue(output, names.botToken), chatId: getValue(output, names.chatId) };
}

function getValue(output: GetParametersCommandOutput, name: string): string {
  const value = output.Parameters?.find((parameter) => parameter.Name === name)?.Value;
  if (value === undefined || value === '') {
    throw new Error(`Telegram parameter ${name} has no value`);
  }
  return value;
}
