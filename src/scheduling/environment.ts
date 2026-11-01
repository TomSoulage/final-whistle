import { getRequiredEnv } from '../shared/get-required-env.js';
import type { MatchCheckTarget } from './match-schedule.js';

/** Names of the variables, set by the stack, that say where a match check goes. They hold names and ARNs, never secrets. */
export const MATCH_CHECK_GROUP_VARIABLE = 'MATCH_CHECK_SCHEDULE_GROUP';
export const MATCH_CHECK_FUNCTION_VARIABLE = 'MATCH_CHECK_FUNCTION_ARN';
export const MATCH_CHECK_ROLE_VARIABLE = 'MATCH_CHECK_ROLE_ARN';

/** The schedule group and invoke role of match checks; the function to invoke is given by each Lambda. */
export type MatchCheckDestination = Omit<MatchCheckTarget, 'functionArn'>;

/** Read at cold start: a missing variable fails with its name. */
export function readMatchCheckDestination(): MatchCheckDestination {
  return {
    scheduleGroupName: getRequiredEnv(MATCH_CHECK_GROUP_VARIABLE),
    roleArn: getRequiredEnv(MATCH_CHECK_ROLE_VARIABLE),
  };
}
