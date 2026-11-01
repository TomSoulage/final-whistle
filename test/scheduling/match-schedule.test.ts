import { ConflictException, ValidationException } from '@aws-sdk/client-scheduler';
import { describe, expect, it, vi } from 'vitest';
import {
  buildMatchCheckCommand,
  buildScheduleName,
  scheduleMatchCheck,
} from '../../src/scheduling/match-schedule.js';
import { parseParisWallClock } from '../../src/scheduling/paris-time.js';

const CHECK = { date: '2026-11-01', homeTeam: 'Saint-Estève XIII Catalan', awayTeam: 'Lézignan', attempt: 1 };
const TARGET = {
  scheduleGroupName: 'final-whistle-match-checks',
  functionArn: 'arn:aws:lambda:eu-west-3:123456789012:function:fetch-results',
  roleArn: 'arn:aws:iam::123456789012:role/match-checks',
};
const CHECK_AT = parseParisWallClock('2026-11-01', '17:00');

describe('buildScheduleName', () => {
  it('is a short name with only allowed characters, the same on every run', () => {
    expect(buildScheduleName(CHECK)).toMatch(/^match-[0-9a-f]{32}-1$/u);
    expect(buildScheduleName({ ...CHECK })).toBe(buildScheduleName(CHECK));
  });

  it('differs from one match to another', () => {
    expect(buildScheduleName({ ...CHECK, awayTeam: 'Carcassonne' })).not.toBe(buildScheduleName(CHECK));
  });

  it('differs from one attempt to the next, with the same match hash', () => {
    const firstName = buildScheduleName(CHECK);

    expect(buildScheduleName({ ...CHECK, attempt: 2 })).toBe(`${firstName.slice(0, -1)}2`);
  });
});

describe('buildMatchCheckCommand', () => {
  it('invokes fetch-results once with the match check, in Paris time, then deletes itself', () => {
    expect(buildMatchCheckCommand(TARGET, CHECK, CHECK_AT).input).toEqual({
      Name: buildScheduleName(CHECK),
      GroupName: TARGET.scheduleGroupName,
      Description: 'Check 2026-11-01|Saint-Estève XIII Catalan|Lézignan, attempt 1',
      ScheduleExpression: 'at(2026-11-01T17:00:00)',
      ScheduleExpressionTimezone: 'Europe/Paris',
      FlexibleTimeWindow: { Mode: 'OFF' },
      ActionAfterCompletion: 'DELETE',
      Target: { Arn: TARGET.functionArn, RoleArn: TARGET.roleArn, Input: JSON.stringify(CHECK) },
    });
  });
});

describe('scheduleMatchCheck', () => {
  it('creates the schedule', async () => {
    const send = vi.fn().mockResolvedValue({ ScheduleArn: 'arn', $metadata: {} });

    await expect(scheduleMatchCheck(send, TARGET, CHECK, CHECK_AT)).resolves.toBe('created');
    expect(send).toHaveBeenCalledOnce();
  });

  it('counts a schedule that already exists as done', async () => {
    const send = vi.fn().mockRejectedValue(new ConflictException({ message: 'exists', Message: 'exists', $metadata: {} }));

    await expect(scheduleMatchCheck(send, TARGET, CHECK, CHECK_AT)).resolves.toBe('already-scheduled');
  });

  it('fails with the match id and keeps the cause', async () => {
    const cause = new ValidationException({ message: 'bad expression', Message: 'bad expression', $metadata: {} });
    const send = vi.fn().mockRejectedValue(cause);

    await expect(scheduleMatchCheck(send, TARGET, CHECK, CHECK_AT)).rejects.toThrow(
      expect.objectContaining({ message: 'check 1 of 2026-11-01|Saint-Estève XIII Catalan|Lézignan not scheduled', cause }),
    );
  });
});
