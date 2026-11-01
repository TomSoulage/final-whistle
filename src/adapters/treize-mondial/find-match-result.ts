import type { MatchKey, MatchLookup } from '../../results/match-result.js';
import type { PageDay } from './parse-cells.js';
import type { MatchesPage } from './parse-matches-page.js';

/** Looks the match up on a parsed page; the page must be the one for the match date. */
export function findMatchResult(page: MatchesPage, key: MatchKey): MatchLookup {
  if (!isPageForDate(page.day, key.date)) {
    return { status: 'not-found' };
  }
  const match = page.matches.find(
    (candidate) => candidate.homeTeam === key.homeTeam && candidate.awayTeam === key.awayTeam,
  );
  if (match === undefined) {
    return { status: 'not-found' };
  }
  if (match.finalScore === null) {
    return { status: 'not-finished' };
  }
  return { status: 'finished', result: { ...key, competition: match.competition, ...match.finalScore } };
}

/** The page shows no year, so only the day and month of the ISO date (YYYY-MM-DD) are compared. */
export function isPageForDate(pageDay: PageDay, isoDate: string): boolean {
  const [, month, day] = isoDate.split('-').map(Number);
  return pageDay.day === day && pageDay.month === month;
}
