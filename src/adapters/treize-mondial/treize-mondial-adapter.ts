import type { MatchKey, MatchLookup } from '../../results/match-result.js';
import { fetchMatchesPage } from './fetch-matches-page.js';
import { findMatchResult, isPageForDate } from './find-match-result.js';
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
  return page === null ? { status: 'not-found' } : findMatchResult(page, key);
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

function parsePage(url: string, html: string): MatchesPage {
  try {
    return parseMatchesPage(html);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Treize Mondial page ${url}: ${reason}`, { cause: error });
  }
}
