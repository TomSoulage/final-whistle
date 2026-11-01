import { buildMatchId, type MatchKey, type MatchLookup, type MatchResult } from '../results/match-result.js';
import { parseMatchCheck, type MatchCheck } from '../scheduling/match-check.js';
import type { ScheduleOutcome } from '../scheduling/match-schedule.js';
import { formatParisWallClock, type ParisWallClock } from '../scheduling/paris-time.js';
import { planRetry } from '../scheduling/plan-check-time.js';
import { describeError, type LogFields, type Logger } from '../shared/logger.js';

const INPUT_NAME = 'fetch-results input';

export interface CheckMatchDependencies {
  readonly getMatchResult: (key: MatchKey) => Promise<MatchLookup>;
  readonly publishMatchFinished: (result: MatchResult) => Promise<void>;
  readonly scheduleMatchCheck: (check: MatchCheck, checkAt: ParisWallClock) => Promise<ScheduleOutcome>;
  readonly createLogger: (context: LogFields) => Logger;
  readonly now: () => Date;
}

export type MatchStatus = MatchLookup['status'];

/**
 * Looks the match up and publishes MatchFinished once it is finished; otherwise schedules the next attempt,
 * until the attempts are used up (D35). Failures are logged, then rethrown for a retry.
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
  const lookup = await dependencies.getMatchResult(check);
  if (lookup.status === 'finished') {
    await dependencies.publishMatchFinished(lookup.result);
    const { competition, homeScore, awayScore } = lookup.result;
    logger.info('match finished, result published', { attempt: check.attempt, competition, homeScore, awayScore });
    return lookup.status;
  }
  const retry = await scheduleRetry(check, dependencies);
  if (retry === null) {
    logger.warn('match given up', { attempt: check.attempt, status: lookup.status });
  } else if (lookup.status === 'not-finished') {
    logger.info('match not finished yet', { attempt: check.attempt, ...retry });
  } else {
    logger.warn('match not found on the source page', { attempt: check.attempt, ...retry });
  }
  return lookup.status;
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
