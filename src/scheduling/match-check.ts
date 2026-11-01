import type { MatchKey } from '../results/match-result.js';
import { isObject, parseMatchKey } from '../results/parse-match-key.js';

/** The input of a match check (D28): the match key and which attempt this is, counted from 1. */
export interface MatchCheck extends MatchKey {
  readonly attempt: number;
}

export const FIRST_ATTEMPT = 1;

/** Validates a match check, e.g. `{ date: '2026-11-01', homeTeam: 'Carcassonne', awayTeam: 'Lézignan', attempt: 1 }`. */
export function parseMatchCheck(input: unknown, inputName: string): MatchCheck {
  const key = parseMatchKey(input, inputName);
  const attempt = isObject(input) ? input.attempt : undefined;
  if (typeof attempt !== 'number' || !Number.isInteger(attempt) || attempt < FIRST_ATTEMPT) {
    throw new Error(`${inputName}: attempt must be a whole number from 1, got ${JSON.stringify(attempt)}`);
  }
  return { ...key, attempt };
}
