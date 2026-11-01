import type { PutEventsRequestEntry } from '@aws-sdk/client-eventbridge';
import { buildMatchId, type MatchResult } from '../results/match-result.js';
import { isNonEmptyString, isObject, parseMatchKey } from '../results/parse-match-key.js';

/** Shared by the producer and the rules that route the event (D6). */
export const MATCH_FINISHED_SOURCE = 'final-whistle.fetch-results';
export const MATCH_FINISHED_DETAIL_TYPE = 'MatchFinished';

export interface MatchFinishedDetail extends MatchResult {
  readonly matchId: string;
}

export function buildMatchFinishedEntry(eventBusName: string, result: MatchResult): PutEventsRequestEntry {
  const detail: MatchFinishedDetail = { matchId: buildMatchId(result), ...result };
  return {
    EventBusName: eventBusName,
    Source: MATCH_FINISHED_SOURCE,
    DetailType: MATCH_FINISHED_DETAIL_TYPE,
    Detail: JSON.stringify(detail),
  };
}

const DETAIL_NAME = 'MatchFinished detail';

/** Validates a MatchFinished event received from the bus and returns its detail, before anything is sent. */
export function parseMatchFinishedEvent(event: unknown): MatchFinishedDetail {
  const detail = isObject(event) ? event.detail : undefined;
  const key = parseMatchKey(detail, DETAIL_NAME);
  const { matchId, competition, homeScore, awayScore } = detail as Record<string, unknown>;
  if (!isNonEmptyString(matchId) || !isNonEmptyString(competition)) {
    throw new Error(
      `${DETAIL_NAME}: matchId and competition must be non-empty strings, got ${JSON.stringify({ matchId, competition })}`,
    );
  }
  if (!isScore(homeScore) || !isScore(awayScore)) {
    throw new Error(
      `${DETAIL_NAME} for ${matchId}: scores must be whole numbers ≥ 0, got ${JSON.stringify({ homeScore, awayScore })}`,
    );
  }
  return { matchId, ...key, competition, homeScore, awayScore };
}

function isScore(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}
