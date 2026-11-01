import type { MatchKey } from '../results/match-result.js';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_DATE_LENGTH = 10;

/** Validates the event sent to fetch-results, e.g. `{ date: '2026-11-01', homeTeam: 'Carcassonne', awayTeam: 'Lézignan' }`. */
export function parseMatchKey(input: unknown): MatchKey {
  if (typeof input !== 'object' || input === null) {
    throw new Error(`fetch-results input: expected { date, homeTeam, awayTeam }, got ${JSON.stringify(input)}`);
  }
  const { date, homeTeam, awayTeam } = input as Record<string, unknown>;
  if (!isIsoDate(date)) {
    throw new Error(`fetch-results input: date must be a real YYYY-MM-DD date, got ${JSON.stringify(date)}`);
  }
  if (!isTeamName(homeTeam) || !isTeamName(awayTeam)) {
    throw new Error(
      `fetch-results input: homeTeam and awayTeam must be non-empty strings, got ${JSON.stringify({ homeTeam, awayTeam })}`,
    );
  }
  return { date, homeTeam, awayTeam };
}

/** A calendar date that exists: `2026-02-30` matches the pattern but is rejected. */
function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const time = Date.parse(value);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, ISO_DATE_LENGTH) === value;
}

function isTeamName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
