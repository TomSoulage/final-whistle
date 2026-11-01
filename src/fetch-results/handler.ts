import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { SchedulerClient } from '@aws-sdk/client-scheduler';
import { getMatchResult } from '../adapters/treize-mondial/treize-mondial-adapter.js';
import type { MatchResult } from '../results/match-result.js';
import { readMatchCheckDestination } from '../scheduling/environment.js';
import type { MatchCheck } from '../scheduling/match-check.js';
import { scheduleMatchCheck } from '../scheduling/match-schedule.js';
import type { ParisWallClock } from '../scheduling/paris-time.js';
import { getRequiredEnv } from '../shared/get-required-env.js';
import { createLogger, type LogFields } from '../shared/logger.js';
import { checkMatch, type MatchStatus } from './check-match.js';
import { EVENT_BUS_NAME_VARIABLE } from './environment.js';
import { publishMatchFinished } from './publish-match-finished.js';

const SERVICE_NAME = 'fetch-results';

/** The part of the Lambda context used here. */
interface LambdaContext {
  /**
   * The ARN this function was invoked with: the next attempt invokes it again (the stack cannot give a function
   * its own ARN). Behind an alias (D15) it ends with the alias, which the match check invoke role must then allow.
   */
  readonly invokedFunctionArn: string;
}

/** Read once, at cold start. */
const eventBusName = getRequiredEnv(EVENT_BUS_NAME_VARIABLE);
const matchCheckDestination = readMatchCheckDestination();
const eventBridge = new EventBridgeClient({});
const scheduler = new SchedulerClient({});

/** fetch-results Lambda: only wires the adapter, the bus, Scheduler, the clock and the logs to `checkMatch`. */
export async function handler(event: unknown, context: LambdaContext): Promise<{ readonly status: MatchStatus }> {
  const matchCheckTarget = { ...matchCheckDestination, functionArn: context.invokedFunctionArn };
  const status = await checkMatch(event, {
    getMatchResult,
    publishMatchFinished: (result: MatchResult) =>
      publishMatchFinished((command) => eventBridge.send(command), eventBusName, result),
    scheduleMatchCheck: (check: MatchCheck, checkAt: ParisWallClock) =>
      scheduleMatchCheck((command) => scheduler.send(command), matchCheckTarget, check, checkAt),
    createLogger: (logContext: LogFields) => createLogger({ service: SERVICE_NAME, ...logContext }),
    now: () => new Date(),
  });
  return { status };
}
