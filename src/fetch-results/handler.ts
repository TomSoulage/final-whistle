import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { getMatchResult } from '../adapters/treize-mondial/treize-mondial-adapter.js';
import type { MatchResult } from '../results/match-result.js';
import { getRequiredEnv } from '../shared/get-required-env.js';
import { createLogger, type LogFields } from '../shared/logger.js';
import { checkMatch, type MatchStatus } from './check-match.js';
import { EVENT_BUS_NAME_VARIABLE } from './environment.js';
import { publishMatchFinished } from './publish-match-finished.js';

const SERVICE_NAME = 'fetch-results';

/** Read once, at cold start. */
const eventBusName = getRequiredEnv(EVENT_BUS_NAME_VARIABLE);
const eventBridge = new EventBridgeClient({});

/** fetch-results Lambda: only wires the adapter, the bus and the logs to `checkMatch`. */
export async function handler(event: unknown): Promise<{ readonly status: MatchStatus }> {
  const status = await checkMatch(event, {
    getMatchResult,
    publishMatchFinished: (result: MatchResult) =>
      publishMatchFinished((command) => eventBridge.send(command), eventBusName, result),
    createLogger: (context: LogFields) => createLogger({ service: SERVICE_NAME, ...context }),
  });
  return { status };
}
