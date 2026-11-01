import type { PutEventsRequestEntry } from '@aws-sdk/client-eventbridge';
import { buildMatchId, type MatchResult } from '../results/match-result.js';

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
