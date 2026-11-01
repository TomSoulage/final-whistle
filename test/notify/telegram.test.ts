import { describe, expect, it, vi } from 'vitest';
import { type Fetch, sendTelegramMessage } from '../../src/notify/telegram.js';
import { describeError } from '../../src/shared/logger.js';

const BOT_TOKEN = '123456:FAKE-token-for-tests';
const CHAT = { botToken: BOT_TOKEN, chatId: '987654' };
const MATCH_ID = '2026-11-01|Carcassonne|Lézignan';
const TEXT = 'Score final · SUPER XIII\nCarcassonne 22 – 18 Lézignan';

function respondWith(status: number, body: string) {
  return vi.fn<Fetch>(() => Promise.resolve(new Response(body, { status })));
}

async function getFailure(fetchUrl: Fetch): Promise<Error> {
  const error: unknown = await sendTelegramMessage(fetchUrl, CHAT, TEXT, MATCH_ID).catch((rejection: unknown) => rejection);
  if (!(error instanceof Error)) {
    throw new Error('Expected sendTelegramMessage to fail');
  }
  return error;
}

describe('sendTelegramMessage', () => {
  it('posts the plain-text message to the chat, with a timeout', async () => {
    const fetchUrl = respondWith(200, '{"ok":true}');

    await sendTelegramMessage(fetchUrl, CHAT, TEXT, MATCH_ID);

    const [url, init] = fetchUrl.mock.calls[0] ?? [];
    expect(url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`);
    expect(init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' } });
    expect(JSON.parse(init?.body as string)).toEqual({ chat_id: '987654', text: TEXT });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('fails with the HTTP status and the reason given by Telegram, naming the match', async () => {
    const error = await getFailure(respondWith(400, '{"ok":false,"description":"Bad Request: chat not found"}'));

    expect(error.message).toBe(`Telegram rejected the message for ${MATCH_ID}: HTTP 400 Bad Request: chat not found`);
  });

  it('fails with the HTTP status alone when the body is not JSON', async () => {
    const error = await getFailure(respondWith(502, '<html>Bad Gateway</html>'));

    expect(error.message).toBe(`Telegram rejected the message for ${MATCH_ID}: HTTP 502 (no description)`);
  });

  it('reports a request failure by its name and code only', async () => {
    const networkError = new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
    const error = await getFailure(vi.fn<Fetch>(() => Promise.reject(networkError)));

    expect(error.message).toBe(`Telegram request failed for ${MATCH_ID}: TypeError ECONNRESET`);
    expect(error.cause).toBeUndefined();
  });

  it('reports a rejection that is not an Error', async () => {
    const error = await getFailure(vi.fn<Fetch>().mockRejectedValue('offline'));

    expect(error.message).toBe(`Telegram request failed for ${MATCH_ID}: unknown error`);
  });

  it('reports a timeout', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const error = await getFailure(vi.fn<Fetch>(() => Promise.reject(timeout)));

    expect(error.message).toBe(`Telegram request failed for ${MATCH_ID}: TimeoutError`);
  });

  it('never lets the bot token reach the error or its log line, even when the request error quotes the URL', async () => {
    const leakingError = new Error(`request to https://api.telegram.org/bot${BOT_TOKEN}/sendMessage failed`, {
      cause: new Error(`connect ECONNREFUSED for bot${BOT_TOKEN}`),
    });
    const error = await getFailure(vi.fn<Fetch>(() => Promise.reject(leakingError)));

    expect(JSON.stringify(describeError(error))).not.toContain(BOT_TOKEN);
  });
});
