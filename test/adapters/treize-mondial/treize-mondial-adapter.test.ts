import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMatchesPage } from '../../../src/adapters/treize-mondial/fetch-matches-page.js';
import {
  getMatchResult,
  PREVIOUS_DAY_PAGE_URL,
  TODAY_PAGE_URL,
} from '../../../src/adapters/treize-mondial/treize-mondial-adapter.js';
import { readFixture } from '../../fixtures/treize-mondial/read-fixture.js';

vi.mock('../../../src/adapters/treize-mondial/fetch-matches-page.js');

const PAGES_BY_URL = new Map([
  [TODAY_PAGE_URL, readFixture('2026-11-01-in-progress.html')],
  [PREVIOUS_DAY_PAGE_URL, readFixture('2026-10-31-all-finished.html')],
]);

describe('getMatchResult', () => {
  beforeEach(() => {
    vi.mocked(fetchMatchesPage).mockReset();
    vi.mocked(fetchMatchesPage).mockImplementation((url) =>
      Promise.resolve(PAGES_BY_URL.get(url) ?? ''),
    );
  });

  it('reads a finished match of the day from the main page only', async () => {
    const lookup = await getMatchResult({
      date: '2026-11-01',
      homeTeam: 'Australie (F)',
      awayTeam: 'Pays de Galles (F)',
    });

    expect(lookup).toEqual({
      status: 'finished',
      result: {
        date: '2026-11-01',
        homeTeam: 'Australie (F)',
        awayTeam: 'Pays de Galles (F)',
        competition: 'COUPE DU MONDE 2026 – 3ÈME JOURNÉE',
        homeScore: 124,
        awayScore: 6,
      },
    });
    expect(fetchMatchesPage).toHaveBeenCalledTimes(1);
  });

  it('reports a match of the day at half-time as not finished', async () => {
    const lookup = await getMatchResult({ date: '2026-11-01', homeTeam: 'Liban', awayTeam: 'France' });

    expect(lookup).toEqual({ status: 'not-finished' });
  });

  it('reads the previous day page once the main page has moved on', async () => {
    const lookup = await getMatchResult({
      date: '2026-10-31',
      homeTeam: 'Saint-Estève XIII Catalan',
      awayTeam: 'Toulouse Olympique',
    });

    expect(lookup).toMatchObject({ status: 'finished', result: { homeScore: 24, awayScore: 38 } });
    expect(fetchMatchesPage).toHaveBeenNthCalledWith(2, PREVIOUS_DAY_PAGE_URL);
  });

  it('does not find a match when neither page is for its date', async () => {
    const lookup = await getMatchResult({ date: '2026-10-30', homeTeam: 'Angleterre', awayTeam: 'Samoa' });

    expect(lookup).toEqual({ status: 'not-found' });
  });

  it('fails with the URL of a page that cannot be parsed', async () => {
    vi.mocked(fetchMatchesPage).mockResolvedValue('<p>Maintenance</p>');

    await expect(
      getMatchResult({ date: '2026-11-01', homeTeam: 'Liban', awayTeam: 'France' }),
    ).rejects.toThrow(`Treize Mondial page ${TODAY_PAGE_URL}: day header`);
  });

  it('lets a download failure through, so the call can be retried', async () => {
    vi.mocked(fetchMatchesPage).mockRejectedValue(new Error('Treize Mondial page: HTTP 503'));

    await expect(
      getMatchResult({ date: '2026-11-01', homeTeam: 'Liban', awayTeam: 'France' }),
    ).rejects.toThrow('HTTP 503');
  });
});
