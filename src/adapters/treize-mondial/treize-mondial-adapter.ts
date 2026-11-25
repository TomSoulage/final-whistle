import type { DayListing, MatchKey, MatchLookup } from '../../results/match-result.js';
import { SourceUnavailableError } from '../../results/source-unavailable-error.js';
import { fetchMatchesPage } from './fetch-matches-page.js';
import { findMatchResult, isPageForDate } from './find-match-result.js';
import { PageLayoutError } from './page-layout-error.js';
import { parseMatchesPage, type MatchesPage } from './parse-matches-page.js';

export const TODAY_PAGE_URL = 'https://treizemondial.fr/matchs-du-jour-rugby-a-xiii/';
/**
 * Held the previous day when checked (2026-11-01): needed once the main page has moved on,
 * e.g. for a late match checked after midnight. Its date is checked like any other page.
 */
export const PREVIOUS_DAY_PAGE_URL = `${TODAY_PAGE_URL}2/`;

const PAGE_URLS = [TODAY_PAGE_URL, PREVIOUS_DAY_PAGE_URL];

/** Treize Mondial source adapter: the result of one match, normalised (D2). */
export async function getMatchResult(key: MatchKey): Promise<MatchLookup> {
  const page = await readPageForDate(key.date);
  return page === null ? { status: 'page-not-found' } : findMatchResult(page, key);
}

/** Every match of the main page; `page-not-found` when it shows another day than `isoDate` (YYYY-MM-DD). */
export async function listDayMatches(isoDate: string): Promise<DayListing> {
  const page = parsePage(TODAY_PAGE_URL, await fetchMatchesPage(TODAY_PAGE_URL));
  if (!isPageForDate(page.day, isoDate)) {
    return { status: 'page-not-found' };
  }
  const matches = page.matches.map(({ homeTeam, awayTeam, kickOff }) => ({
    key: { date: isoDate, homeTeam, awayTeam },
    kickOff,
  }));
  return { status: 'listed', matches };
}

/** Reads the pages in order and stops at the first one for the date; most calls need one request. */
async function readPageForDate(isoDate: string): Promise<MatchesPage | null> {
  for (const url of PAGE_URLS) {
    const page = parsePage(url, await fetchMatchesPage(url));
    if (isPageForDate(page.day, isoDate)) {
      return page;
    }
  }
  return null;
}

/** Only a page of an unexpected shape is a problem of the source; any other error is a bug and is let through. */
function parsePage(url: string, html: string): MatchesPage {
  try {
    return parseMatchesPage(html);
  } catch (error) {
    if (!(error instanceof PageLayoutError)) {
      throw error;
    }
    throw new SourceUnavailableError(`Treize Mondial page ${url}: ${error.message}`, { cause: error });
  }
}
