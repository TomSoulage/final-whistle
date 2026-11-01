/** Identifies a match: the date of the source page (YYYY-MM-DD) and both teams, exactly as published (D8). */
export interface MatchKey {
  readonly date: string;
  readonly homeTeam: string;
  readonly awayTeam: string;
}

export interface FinalScore {
  readonly homeScore: number;
  readonly awayScore: number;
}

/** A finished match, normalised: every source adapter returns this shape (D2). */
export interface MatchResult extends MatchKey, FinalScore {
  readonly competition: string;
}

/** A match listed for the day, before its result is known: every source adapter returns this shape (D2). */
export interface DayMatch {
  readonly key: MatchKey;
  /** Kick-off time in French local time, `HH:MM`, or null when the source does not give one yet. */
  readonly kickOff: string | null;
}

/** What a source knows about a match when it is asked for its result. */
export type MatchLookup =
  | { readonly status: 'finished'; readonly result: MatchResult }
  | { readonly status: 'not-finished' }
  | { readonly status: 'not-found' };

const MATCH_ID_SEPARATOR = '|';

/** Builds the idempotence key, e.g. `2026-10-30|Angleterre|Papouasie-Nouvelle-Guinée` (D8). */
export function buildMatchId(key: MatchKey): string {
  return [key.date, key.homeTeam, key.awayTeam].join(MATCH_ID_SEPARATOR);
}
