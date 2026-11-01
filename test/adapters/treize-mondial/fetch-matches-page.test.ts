import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMatchesPage, USER_AGENT } from '../../../src/adapters/treize-mondial/fetch-matches-page.js';

const MATCHES_PAGE_URL = 'https://treizemondial.fr/matchs-du-jour-rugby-a-xiii/';

function stubFetch(implementation: () => Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(implementation);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('fetchMatchesPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the page HTML and names the bot in the User-Agent', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response('<table></table>')));

    await expect(fetchMatchesPage(MATCHES_PAGE_URL)).resolves.toBe('<table></table>');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(MATCHES_PAGE_URL);
    expect(init?.headers).toEqual({ 'user-agent': USER_AGENT });
    expect(USER_AGENT).toContain('final-whistle');
  });

  it('fails with the URL and status on an HTTP error', async () => {
    stubFetch(() => Promise.resolve(new Response('', { status: 503 })));

    await expect(fetchMatchesPage(MATCHES_PAGE_URL)).rejects.toThrow(
      `Treize Mondial page ${MATCHES_PAGE_URL}: HTTP 503`,
    );
  });

  it('fails with the URL and keeps the cause when the request itself fails', async () => {
    const networkError = new TypeError('fetch failed');
    stubFetch(() => Promise.reject(networkError));

    await expect(fetchMatchesPage(MATCHES_PAGE_URL)).rejects.toMatchObject({
      message: `Treize Mondial page ${MATCHES_PAGE_URL}: request failed`,
      cause: networkError,
    });
  });

  it('fails with the URL when reading the page body fails, e.g. on a timeout', async () => {
    const timeoutError = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    const failingBody = new ReadableStream({
      start(controller) {
        controller.error(timeoutError);
      },
    });
    stubFetch(() => Promise.resolve(new Response(failingBody)));

    await expect(fetchMatchesPage(MATCHES_PAGE_URL)).rejects.toMatchObject({
      message: `Treize Mondial page ${MATCHES_PAGE_URL}: request failed`,
      cause: timeoutError,
    });
  });
});
