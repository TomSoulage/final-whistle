import {
  buildMatchId,
  type MatchKey,
  type MatchLookup,
  type MatchResult,
} from '../results/match-result.js';
import { describeError, type LogFields, type Logger } from '../shared/logger.js';
import { parseMatchKey } from './parse-match-key.js';

export interface CheckMatchDependencies {
  readonly getMatchResult: (key: MatchKey) => Promise<MatchLookup>;
  readonly publishMatchFinished: (result: MatchResult) => Promise<void>;
  readonly createLogger: (context: LogFields) => Logger;
}

export type MatchStatus = MatchLookup['status'];

/** Looks the match up and publishes MatchFinished once it is finished. Failures are logged, then rethrown for a retry. */
export async function checkMatch(input: unknown, dependencies: CheckMatchDependencies): Promise<MatchStatus> {
  const key = parseInput(input, dependencies);
  const logger = dependencies.createLogger({ matchId: buildMatchId(key) });
  try {
    return await reportLookup(key, logger, dependencies);
  } catch (error) {
    logger.error('match check failed', { error: describeError(error) });
    throw error;
  }
}

function parseInput(input: unknown, dependencies: CheckMatchDependencies): MatchKey {
  try {
    return parseMatchKey(input);
  } catch (error) {
    dependencies.createLogger({}).error('invalid input', { input, error: describeError(error) });
    throw error;
  }
}

async function reportLookup(key: MatchKey, logger: Logger, dependencies: CheckMatchDependencies): Promise<MatchStatus> {
  const lookup = await dependencies.getMatchResult(key);
  if (lookup.status === 'finished') {
    await dependencies.publishMatchFinished(lookup.result);
    const { competition, homeScore, awayScore } = lookup.result;
    logger.info('match finished, result published', { competition, homeScore, awayScore });
  } else if (lookup.status === 'not-finished') {
    logger.info('match not finished yet');
  } else {
    logger.warn('match not found on the source page');
  }
  return lookup.status;
}
