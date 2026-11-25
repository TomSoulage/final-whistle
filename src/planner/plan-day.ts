import { buildMatchId, type DayListing, type DayMatch } from '../results/match-result.js';
import { SourceUnavailableError } from '../results/source-unavailable-error.js';
import { FIRST_ATTEMPT, type MatchCheck } from '../scheduling/match-check.js';
import type { ScheduleOutcome } from '../scheduling/match-schedule.js';
import {
  formatParisWallClock,
  getParisDate,
  toParisWallClock,
  type ParisWallClock,
} from '../scheduling/paris-time.js';
import { planFirstCheck } from '../scheduling/plan-check-time.js';
import { describeError, type LogFields, type Logger } from '../shared/logger.js';

export interface PlanDayDependencies {
  readonly listDayMatches: (isoDate: string) => Promise<DayListing>;
  readonly scheduleMatchCheck: (check: MatchCheck, checkAt: ParisWallClock) => Promise<ScheduleOutcome>;
  readonly createLogger: (context: LogFields) => Logger;
  readonly now: () => Date;
}

export interface DayPlan {
  readonly date: string;
  readonly matchCount: number;
}

/**
 * Schedules one check per match of the day (D4). A match that fails does not stop the others: the run
 * fails at the end, and its retry finds the other matches already scheduled. A day the source cannot give
 * is logged and planned with no match, without failing (D42).
 */
export async function planDay(dependencies: PlanDayDependencies): Promise<DayPlan> {
  const now = dependencies.now();
  const date = getParisDate(toParisWallClock(now));
  const logger = dependencies.createLogger({ date });
  const matches = await listMatches(date, logger, dependencies);
  if (matches === null) {
    return { date, matchCount: 0 };
  }
  const plannedMatches: boolean[] = [];
  for (const match of matches) {
    plannedMatches.push(await planMatch(match, now, dependencies));
  }
  const failedCount = plannedMatches.filter((isPlanned) => !isPlanned).length;
  logger.info('day planned', { matchCount: matches.length, failedCount });
  if (failedCount > 0) {
    throw new Error(`${String(failedCount)} of ${String(matches.length)} match checks not scheduled for ${date}`);
  }
  return { date, matchCount: matches.length };
}

/** The matches of the day; null when the source has no page for it or cannot be read (D42). */
async function listMatches(
  date: string,
  logger: Logger,
  dependencies: PlanDayDependencies,
): Promise<readonly DayMatch[] | null> {
  try {
    const listing = await dependencies.listDayMatches(date);
    if (listing.status === 'page-not-found') {
      logger.info('no source page for the day, no match planned');
      return null;
    }
    return listing.matches;
  } catch (error) {
    if (error instanceof SourceUnavailableError) {
      logger.error('source unavailable, day not planned', { error: describeError(error) });
      return null;
    }
    logger.error('matches of the day not read', { error: describeError(error) });
    throw error;
  }
}

/** Returns whether the check is scheduled; a failure is logged with the match id. */
async function planMatch(match: DayMatch, now: Date, dependencies: PlanDayDependencies): Promise<boolean> {
  const logger = dependencies.createLogger({ matchId: buildMatchId(match.key) });
  try {
    const checkAt = planFirstCheck(match, now);
    const fields = { kickOff: match.kickOff, checkAt: formatParisWallClock(checkAt) };
    if (match.kickOff === null) {
      logger.warn('kick-off time missing, fallback check time used', fields);
    }
    const outcome = await dependencies.scheduleMatchCheck({ ...match.key, attempt: FIRST_ATTEMPT }, checkAt);
    logger.info('match check scheduled', { ...fields, outcome });
    return true;
  } catch (error) {
    logger.error('match check not scheduled', { kickOff: match.kickOff, error: describeError(error) });
    return false;
  }
}
