import { buildMatchId, type DayMatch } from '../results/match-result.js';
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
  readonly listDayMatches: (isoDate: string) => Promise<readonly DayMatch[]>;
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
 * fails at the end, and its retry finds the other matches already scheduled.
 */
export async function planDay(dependencies: PlanDayDependencies): Promise<DayPlan> {
  const now = dependencies.now();
  const date = getParisDate(toParisWallClock(now));
  const logger = dependencies.createLogger({ date });
  const matches = await listMatches(date, logger, dependencies);
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

async function listMatches(date: string, logger: Logger, dependencies: PlanDayDependencies): Promise<readonly DayMatch[]> {
  try {
    return await dependencies.listDayMatches(date);
  } catch (error) {
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
