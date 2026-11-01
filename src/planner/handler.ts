import { SchedulerClient } from '@aws-sdk/client-scheduler';
import { listDayMatches } from '../adapters/treize-mondial/treize-mondial-adapter.js';
import type { MatchKey } from '../results/match-result.js';
import {
  MATCH_CHECK_FUNCTION_VARIABLE,
  MATCH_CHECK_GROUP_VARIABLE,
  MATCH_CHECK_ROLE_VARIABLE,
} from '../scheduling/environment.js';
import { scheduleMatchCheck, type MatchCheckTarget } from '../scheduling/match-schedule.js';
import type { ParisWallClock } from '../scheduling/paris-time.js';
import { getRequiredEnv } from '../shared/get-required-env.js';
import { createLogger, type LogFields } from '../shared/logger.js';
import { planDay, type DayPlan } from './plan-day.js';

const SERVICE_NAME = 'planner';

/** Read once, at cold start. */
const matchCheckTarget: MatchCheckTarget = {
  scheduleGroupName: getRequiredEnv(MATCH_CHECK_GROUP_VARIABLE),
  functionArn: getRequiredEnv(MATCH_CHECK_FUNCTION_VARIABLE),
  roleArn: getRequiredEnv(MATCH_CHECK_ROLE_VARIABLE),
};
const scheduler = new SchedulerClient({});

/** planner Lambda: only wires the adapter, Scheduler, the clock and the logs to `planDay`. */
export async function handler(): Promise<DayPlan> {
  return planDay({
    listDayMatches,
    scheduleMatchCheck: (key: MatchKey, checkAt: ParisWallClock) =>
      scheduleMatchCheck((command) => scheduler.send(command), matchCheckTarget, key, checkAt),
    createLogger: (context: LogFields) => createLogger({ service: SERVICE_NAME, ...context }),
    now: () => new Date(),
  });
}
