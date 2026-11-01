import { SchedulerClient } from '@aws-sdk/client-scheduler';
import { listDayMatches } from '../adapters/treize-mondial/treize-mondial-adapter.js';
import { MATCH_CHECK_FUNCTION_VARIABLE, readMatchCheckDestination } from '../scheduling/environment.js';
import type { MatchCheck } from '../scheduling/match-check.js';
import { scheduleMatchCheck, type MatchCheckTarget } from '../scheduling/match-schedule.js';
import type { ParisWallClock } from '../scheduling/paris-time.js';
import { getRequiredEnv } from '../shared/get-required-env.js';
import { createLogger, type LogFields } from '../shared/logger.js';
import { planDay, type DayPlan } from './plan-day.js';

const SERVICE_NAME = 'planner';

/** Read once, at cold start. */
const matchCheckTarget: MatchCheckTarget = {
  ...readMatchCheckDestination(),
  functionArn: getRequiredEnv(MATCH_CHECK_FUNCTION_VARIABLE),
};
const scheduler = new SchedulerClient({});

/** planner Lambda: only wires the adapter, Scheduler, the clock and the logs to `planDay`. */
export async function handler(): Promise<DayPlan> {
  return planDay({
    listDayMatches,
    scheduleMatchCheck: (check: MatchCheck, checkAt: ParisWallClock) =>
      scheduleMatchCheck((command) => scheduler.send(command), matchCheckTarget, check, checkAt),
    createLogger: (context: LogFields) => createLogger({ service: SERVICE_NAME, ...context }),
    now: () => new Date(),
  });
}
