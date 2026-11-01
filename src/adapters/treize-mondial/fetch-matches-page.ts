const FETCH_TIMEOUT_MS = 10_000;
export const USER_AGENT = 'final-whistle (+https://github.com/TomSoulage/final-whistle)';

/** Downloads a "matchs du jour" page, identifying the bot honestly. */
export async function fetchMatchesPage(url: string): Promise<string> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const response = await withRequestContext(url, () =>
    fetch(url, { headers: { 'user-agent': USER_AGENT }, signal }),
  );
  if (!response.ok) {
    throw new Error(`Treize Mondial page ${url}: HTTP ${String(response.status)}`);
  }
  return withRequestContext(url, () => response.text());
}

/** The timeout also covers reading the body, so both steps fail with the URL. */
async function withRequestContext<T>(url: string, step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (error) {
    throw new Error(`Treize Mondial page ${url}: request failed`, { cause: error });
  }
}
