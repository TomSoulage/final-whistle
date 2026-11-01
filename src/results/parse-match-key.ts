import type { MatchKey } from './match-result.js';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_DATE_LENGTH = 10;

/**
 * Validates a match key, e.g. `{ date: '2026-11-01', homeTeam: 'Carcassonne', awayTeam: 'Lézignan' }`.
 * `inputName` says in each error which input was wrong, e.g. `fetch-results input`.
 */
export function parseMatchKey(input: unknown, inputName: string): MatchKey {
  if (!isObject(input)) {
    throw new Error(`${inputName}: expected { date, homeTeam, awayTeam }, got ${JSON.stringify(input)}`);
  }
  const { date, homeTeam, awayTeam } = input;
  if (!isIsoDate(date)) {
    throw new Error(`${inputName}: date must be a real YYYY-MM-DD date, got ${JSON.stringify(date)}`);
  }
  if (!isNonEmptyString(homeTeam) || !isNonEmptyString(awayTeam)) {
    throw new Error(
      `${inputName}: homeTeam and awayTeam must be non-empty strings, got ${JSON.stringify({ homeTeam, awayTeam })}`,
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

/** A non-null object whose fields can be read. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A string with at least one visible character, e.g. a team or competition name. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
