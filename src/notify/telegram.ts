const TELEGRAM_API_URL = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 10_000;

export interface TelegramChat {
  readonly botToken: string;
  readonly chatId: string;
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Sends a plain-text message. The bot token is part of the URL, so a failed request is reported by
 * its error name and code only: the original error, which may quote the URL, never reaches the logs.
 */
export async function sendTelegramMessage(
  fetchUrl: Fetch,
  chat: TelegramChat,
  text: string,
  matchId: string,
): Promise<void> {
  const response = await postMessage(fetchUrl, chat, text).catch((error: unknown) => {
    throw new Error(`Telegram request failed for ${matchId}: ${describeRequestFailure(error)}`);
  });
  if (response.ok) {
    return;
  }
  const description = await readDescription(response);
  throw new Error(`Telegram rejected the message for ${matchId}: HTTP ${String(response.status)} ${description}`);
}

function postMessage(fetchUrl: Fetch, chat: TelegramChat, text: string): Promise<Response> {
  return fetchUrl(`${TELEGRAM_API_URL}/bot${chat.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat.chatId, text }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/** Only the error name and system code, e.g. `TypeError ECONNRESET` or `TimeoutError`. */
function describeRequestFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'unknown error';
  }
  const code: unknown = (error.cause as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? `${error.name} ${code}` : error.name;
}

/**
 * Telegram explains a rejection in `description`, e.g. `Bad Request: chat not found`. A body that is
 * not JSON (a proxy error page) still fails the send, with its HTTP status and `(no description)`.
 */
async function readDescription(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => undefined);
  const description = (body as { description?: unknown } | undefined)?.description;
  return typeof description === 'string' ? description : '(no description)';
}
