import { type MatchFinishedDetail, parseMatchFinishedEvent } from '../events/match-finished.js';
import { describeError, type LogFields, type Logger } from '../shared/logger.js';
import { formatScoreMessage } from './format-score-message.js';
import type { RememberOutcome } from './sent-matches.js';

export interface NotifyMatchDependencies {
  readonly isAlreadySent: (matchId: string) => Promise<boolean>;
  readonly sendMessage: (text: string, matchId: string) => Promise<void>;
  readonly rememberSent: (matchId: string) => Promise<RememberOutcome>;
  readonly createLogger: (context: LogFields) => Logger;
}

export type NotifyStatus = 'sent' | 'already-sent';

/**
 * Check → send → remember, in this order (D7): a score is recorded only once it has gone out, so a
 * crash in between sends it twice rather than never. Failures are logged, then rethrown for a retry.
 */
export async function notifyMatch(event: unknown, dependencies: NotifyMatchDependencies): Promise<NotifyStatus> {
  const detail = parseEvent(event, dependencies);
  const logger = dependencies.createLogger({ matchId: detail.matchId });
  try {
    return await sendOnce(detail, logger, dependencies);
  } catch (error) {
    logger.error('score notification failed', { error: describeError(error) });
    throw error;
  }
}

function parseEvent(event: unknown, dependencies: NotifyMatchDependencies): MatchFinishedDetail {
  try {
    return parseMatchFinishedEvent(event);
  } catch (error) {
    dependencies.createLogger({}).error('invalid MatchFinished event', { event, error: describeError(error) });
    throw error;
  }
}

async function sendOnce(
  detail: MatchFinishedDetail,
  logger: Logger,
  dependencies: NotifyMatchDependencies,
): Promise<NotifyStatus> {
  if (await dependencies.isAlreadySent(detail.matchId)) {
    logger.info('score already sent, skipped');
    return 'already-sent';
  }
  await dependencies.sendMessage(formatScoreMessage(detail), detail.matchId);
  const outcome = await dependencies.rememberSent(detail.matchId);
  if (outcome === 'already-recorded') {
    // Another invocation sent the same score at the same time: accepted (D7), but counted.
    logger.warn('duplicate sent');
  }
  const { competition, homeScore, awayScore } = detail;
  logger.info('score sent', { competition, homeScore, awayScore });
  return 'sent';
}
