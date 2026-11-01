import type { GetParametersCommandOutput } from '@aws-sdk/client-ssm';
import { describe, expect, it, vi } from 'vitest';
import { readTelegramChat, type SendGetParameters } from '../../src/notify/telegram-chat-parameters.js';

const NAMES = { botToken: '/final-whistle/telegram/bot-token', chatId: '/final-whistle/telegram/chat-id' };

function respondWith(output: Partial<GetParametersCommandOutput>) {
  return vi.fn<SendGetParameters>(() => Promise.resolve({ $metadata: {}, ...output }));
}

describe('readTelegramChat', () => {
  it('reads both parameters in one call, decrypting the token', async () => {
    const send = respondWith({
      Parameters: [
        { Name: NAMES.chatId, Value: '987654' },
        { Name: NAMES.botToken, Value: '123456:FAKE-token' },
      ],
    });

    await expect(readTelegramChat(send, NAMES)).resolves.toEqual({ botToken: '123456:FAKE-token', chatId: '987654' });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].input).toEqual({ Names: [NAMES.botToken, NAMES.chatId], WithDecryption: true });
  });

  it('fails naming the missing parameter, which SSM reports without throwing', async () => {
    const send = respondWith({ Parameters: [{ Name: NAMES.chatId, Value: '987654' }], InvalidParameters: [NAMES.botToken] });

    await expect(readTelegramChat(send, NAMES)).rejects.toThrow(
      'Telegram parameters missing from Parameter Store: /final-whistle/telegram/bot-token',
    );
  });

  it('fails on a parameter returned without a value', async () => {
    const send = respondWith({
      Parameters: [
        { Name: NAMES.botToken, Value: '' },
        { Name: NAMES.chatId, Value: '987654' },
      ],
    });

    await expect(readTelegramChat(send, NAMES)).rejects.toThrow('Telegram parameter /final-whistle/telegram/bot-token has no value');
  });

  it('fails naming both parameters when the call itself fails, keeping the AWS error as the cause', async () => {
    const awsError = new Error('not authorized to perform: ssm:GetParameters');
    const send = vi.fn<SendGetParameters>(() => Promise.reject(awsError));

    await expect(readTelegramChat(send, NAMES)).rejects.toMatchObject({
      message: `Cannot read the Telegram parameters ${NAMES.botToken} and ${NAMES.chatId}`,
      cause: awsError,
    });
  });
});
