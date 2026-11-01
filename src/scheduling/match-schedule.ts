import { createHash } from 'node:crypto';
import {
  ActionAfterCompletion,
  ConflictException,
  CreateScheduleCommand,
  FlexibleTimeWindowMode,
  type CreateScheduleCommandOutput,
} from '@aws-sdk/client-scheduler';
import { buildMatchId, type MatchKey } from '../results/match-result.js';
import { formatParisWallClock, PARIS_TIME_ZONE, type ParisWallClock } from './paris-time.js';

const SCHEDULE_NAME_PREFIX = 'match-';
/** 128 bits of SHA-256: a collision between two matches is out of reach. */
const SCHEDULE_NAME_HASH_LENGTH = 32;

/** Where a match check goes: the schedule group, the fetch-results function and the role Scheduler invokes it with. */
export interface MatchCheckTarget {
  readonly scheduleGroupName: string;
  readonly functionArn: string;
  readonly roleArn: string;
}

export type SendCreateSchedule = (command: CreateScheduleCommand) => Promise<CreateScheduleCommandOutput>;

/** `already-scheduled`: a schedule with this name exists, e.g. when the planner runs twice on the same day. */
export type ScheduleOutcome = 'created' | 'already-scheduled';

/**
 * Schedule names allow only letters, digits, `-`, `_` and `.`, while team names have accents and spaces:
 * the name is a hash of the match id, the same on every run, so a match is never scheduled twice.
 */
export function buildScheduleName(key: MatchKey): string {
  const hash = createHash('sha256').update(buildMatchId(key)).digest('hex');
  return `${SCHEDULE_NAME_PREFIX}${hash.slice(0, SCHEDULE_NAME_HASH_LENGTH)}`;
}

/** A one-time schedule that invokes fetch-results with the match key (D28), then deletes itself. */
export function buildMatchCheckCommand(
  target: MatchCheckTarget,
  key: MatchKey,
  checkAt: ParisWallClock,
): CreateScheduleCommand {
  return new CreateScheduleCommand({
    Name: buildScheduleName(key),
    GroupName: target.scheduleGroupName,
    Description: `Check ${buildMatchId(key)}`,
    ScheduleExpression: `at(${formatParisWallClock(checkAt)})`,
    ScheduleExpressionTimezone: PARIS_TIME_ZONE,
    FlexibleTimeWindow: { Mode: FlexibleTimeWindowMode.OFF },
    ActionAfterCompletion: ActionAfterCompletion.DELETE,
    Target: { Arn: target.functionArn, RoleArn: target.roleArn, Input: JSON.stringify(key) },
  });
}

/** Schedules the check of a match; one already scheduled counts as done, so the call can be repeated. */
export async function scheduleMatchCheck(
  sendCreateSchedule: SendCreateSchedule,
  target: MatchCheckTarget,
  key: MatchKey,
  checkAt: ParisWallClock,
): Promise<ScheduleOutcome> {
  try {
    await sendCreateSchedule(buildMatchCheckCommand(target, key, checkAt));
    return 'created';
  } catch (error) {
    if (error instanceof ConflictException) {
      return 'already-scheduled';
    }
    throw new Error(`check of ${buildMatchId(key)} not scheduled`, { cause: error });
  }
}
