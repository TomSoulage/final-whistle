import { buildMatchId, type MatchKey, type MatchLookup, type MatchResult } from '../results/match-result.js';
import { SourceUnavailableError } from '../results/source-unavailable-error.js';
import { parseMatchCheck, type MatchCheck } from '../scheduling/match-check.js';
import type { ScheduleOutcome } from '../scheduling/match-schedule.js';
import { formatParisWallClock, type ParisWallClock } from '../scheduling/paris-time.js';
import { planRetry } from '../scheduling/plan-check-time.js';
import { describeError, type LogFields, type Logger } from '../shared/logger.js';

const INPUT_NAME = 'fetch-results input';
const MATCH_GIVEN_UP_MESSAGE = 'match given up';
/** A match that left its source page is postponed or cancelled: it is dropped without an alarm (D41). */
const MATCH_DROPPED_MESSAGE = 'match no longer on the source page, dropped';

export interface CheckMatchDependencies {
  readonly getMatchResult: (key: MatchKey) => Promise<MatchLookup>;
  readonly publishMatchFinished: (result: MatchResult) => Promise<void>;
  readonly scheduleMatchCheck: (check: MatchCheck, checkAt: ParisWallClock) => Promise<ScheduleOutcome>;
  readonly createLogger: (context: LogFields) => Logger;
  readonly now: () => Date;
}

/** A source that cannot be read is checked again later, like a page not there yet (D42). */
type CheckLookup = MatchLookup | { readonly status: 'source-unavailable'; readonly error: unknown };

export type MatchStatus = CheckLookup['status'];

/**
 * Looks the match up and publishes MatchFinished once it is finished; otherwise schedules the next attempt,
 * until the attempts are used up (D35) or the match leaves the source page (D41).
 * A source that cannot be read is logged and checked again later (D42); other failures are logged, then
 * rethrown for a retry.
 */
export async function checkMatch(input: unknown, dependencies: CheckMatchDependencies): Promise<MatchStatus> {
  const check = parseInput(input, dependencies);
  const logger = dependencies.createLogger({ matchId: buildMatchId(check) });
  try {
    return await reportLookup(check, logger, dependencies);
  } catch (error) {
    logger.error('match check failed', { attempt: check.attempt, error: describeError(error) });
    throw error;
  }
}

function parseInput(input: unknown, dependencies: CheckMatchDependencies): MatchCheck {
  try {
    return parseMatchCheck(input, INPUT_NAME);
  } catch (error) {
    dependencies.createLogger({}).error('invalid input', { input, error: describeError(error) });
    throw error;
  }
}

async function reportLookup(check: MatchCheck, logger: Logger, dependencies: CheckMatchDependencies): Promise<MatchStatus> {
  const lookup = await lookUpMatch(check, dependencies);
  if (lookup.status === 'finished') {
    await dependencies.publishMatchFinished(lookup.result);
    const { competition, homeScore, awayScore } = lookup.result;
    logger.info('match finished, result published', { attempt: check.attempt, competition, homeScore, awayScore });
    return lookup.status;
  }
  if (lookup.status === 'not-found') {
    logger.warn(MATCH_DROPPED_MESSAGE, { attempt: check.attempt });
    return lookup.status;
  }
  const retry = await scheduleRetry(check, dependencies);
  logNextAttempt(lookup, check.attempt, retry, logger);
  return lookup.status;
}

async function lookUpMatch(check: MatchCheck, dependencies: CheckMatchDependencies): Promise<CheckLookup> {
  try {
    return await dependencies.getMatchResult(check);
  } catch (error) {
    if (error instanceof SourceUnavailableError) {
      return { status: 'source-unavailable', error };
    }
    throw error;
  }
}

/** One log line per attempt, with the time of the next one (D36). */
function logNextAttempt(lookup: CheckLookup, attempt: number, retry: LogFields | null, logger: Logger): void {
  if (lookup.status === 'source-unavailable') {
    const message = retry === null ? 'source unavailable, match given up' : 'source unavailable, match checked again later';
    logger.error(message, { attempt, ...retry, error: describeError(lookup.error) });
  } else if (retry === null) {
    logger.warn(MATCH_GIVEN_UP_MESSAGE, { attempt, status: lookup.status });
  } else if (lookup.status === 'not-finished') {
    logger.info('match not finished yet', { attempt, ...retry });
  } else {
    logger.warn('source page for the match date not available yet', { attempt, ...retry });
  }
}

/** Schedules the next attempt; null once the attempts are used up. */
async function scheduleRetry(check: MatchCheck, dependencies: CheckMatchDependencies): Promise<LogFields | null> {
  const nextCheckAt = planRetry(check.attempt, dependencies.now());
  if (nextCheckAt === null) {
    return null;
  }
  const outcome = await dependencies.scheduleMatchCheck({ ...check, attempt: check.attempt + 1 }, nextCheckAt);
  return { nextCheckAt: formatParisWallClock(nextCheckAt), outcome };
}
