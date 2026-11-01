import { describe, expect, it, vi } from 'vitest';
import { checkMatch, type CheckMatchDependencies } from '../../src/fetch-results/check-match.js';
import type { MatchLookup } from '../../src/results/match-result.js';
import type { ScheduleOutcome } from '../../src/scheduling/match-schedule.js';
import { formatParisWallClock } from '../../src/scheduling/paris-time.js';
import { captureLogs } from '../capture-logs.js';

const KEY = { date: '2026-11-01', homeTeam: 'Carcassonne', awayTeam: 'Lézignan' };
const INPUT = { ...KEY, attempt: 1 };
const MATCH_ID = '2026-11-01|Carcassonne|Lézignan';
const RESULT = { ...KEY, competition: 'SUPER XIII', homeScore: 22, awayScore: 18 };
/** 17:00 in Paris. */
const NOW = new Date('2026-11-01T16:00:00Z');

interface Outcomes {
  readonly publish?: Promise<void>;
  readonly schedule?: Promise<ScheduleOutcome>;
}

function setUp(lookup: Promise<MatchLookup>, outcomes: Outcomes = {}) {
  const { lines, createLogger } = captureLogs();
  const dependencies = {
    getMatchResult: vi.fn<CheckMatchDependencies['getMatchResult']>(() => lookup),
    publishMatchFinished: vi.fn<CheckMatchDependencies['publishMatchFinished']>(
      () => outcomes.publish ?? Promise.resolve(),
    ),
    scheduleMatchCheck: vi.fn<CheckMatchDependencies['scheduleMatchCheck']>(
      () => outcomes.schedule ?? Promise.resolve('created'),
    ),
    createLogger,
    now: () => NOW,
  };
  return { dependencies, lines };
}

/** The attempt and Paris time of the check scheduled by the run, if any. */
function getScheduledCheck(dependencies: ReturnType<typeof setUp>['dependencies']) {
  const [check, checkAt] = dependencies.scheduleMatchCheck.mock.calls[0] ?? [];
  return { check, checkAt: checkAt && formatParisWallClock(checkAt) };
}

describe('checkMatch', () => {
  it('publishes the result of a finished match and logs it with the match id', async () => {
    const { dependencies, lines } = setUp(Promise.resolve({ status: 'finished', result: RESULT }));

    await expect(checkMatch(INPUT, dependencies)).resolves.toBe('finished');

    expect(dependencies.getMatchResult).toHaveBeenCalledWith(INPUT);
    expect(dependencies.publishMatchFinished).toHaveBeenCalledWith(RESULT);
    expect(dependencies.scheduleMatchCheck).not.toHaveBeenCalled();
    expect(lines).toEqual([
      {
        level: 'INFO',
        message: 'match finished, result published',
        matchId: MATCH_ID,
        attempt: 1,
        competition: 'SUPER XIII',
        homeScore: 22,
        awayScore: 18,
      },
    ]);
  });

  it('schedules the next attempt for a match not finished yet, in one log line', async () => {
    const { dependencies, lines } = setUp(Promise.resolve({ status: 'not-finished' }));

    await expect(checkMatch(INPUT, dependencies)).resolves.toBe('not-finished');

    expect(dependencies.publishMatchFinished).not.toHaveBeenCalled();
    expect(getScheduledCheck(dependencies)).toEqual({ check: { ...KEY, attempt: 2 }, checkAt: '2026-11-01T18:00:00' });
    expect(lines).toEqual([
      {
        level: 'INFO',
        message: 'match not finished yet',
        matchId: MATCH_ID,
        attempt: 1,
        nextCheckAt: '2026-11-01T18:00:00',
        outcome: 'created',
      },
    ]);
  });

  it('also schedules the next attempt for a match not found, with a warning', async () => {
    const { dependencies, lines } = setUp(Promise.resolve({ status: 'not-found' }));

    await expect(checkMatch(INPUT, dependencies)).resolves.toBe('not-found');

    expect(getScheduledCheck(dependencies).check).toEqual({ ...KEY, attempt: 2 });
    expect(lines).toEqual([
      expect.objectContaining({ level: 'WARN', message: 'match not found on the source page', attempt: 1 }),
    ]);
  });

  it('counts a next attempt already scheduled by an earlier run as done', async () => {
    const { dependencies, lines } = setUp(Promise.resolve({ status: 'not-finished' }), {
      schedule: Promise.resolve('already-scheduled'),
    });

    await checkMatch(INPUT, dependencies);

    expect(lines).toEqual([expect.objectContaining({ outcome: 'already-scheduled' })]);
  });

  it('gives the match up after the 7th attempt, with a warning', async () => {
    const { dependencies, lines } = setUp(Promise.resolve({ status: 'not-finished' }));

    await expect(checkMatch({ ...INPUT, attempt: 7 }, dependencies)).resolves.toBe('not-finished');

    expect(dependencies.scheduleMatchCheck).not.toHaveBeenCalled();
    expect(lines).toEqual([
      { level: 'WARN', message: 'match given up', matchId: MATCH_ID, attempt: 7, status: 'not-finished' },
    ]);
  });

  it('logs a lookup failure with the match id, then rethrows it for a retry', async () => {
    const { dependencies, lines } = setUp(Promise.reject(new Error('Treize Mondial page: HTTP 503')));

    await expect(checkMatch(INPUT, dependencies)).rejects.toThrow('HTTP 503');

    expect(lines).toMatchObject([
      {
        level: 'ERROR',
        message: 'match check failed',
        matchId: MATCH_ID,
        attempt: 1,
        error: { message: 'Treize Mondial page: HTTP 503' },
      },
    ]);
  });

  it('logs and rethrows a publish failure, so the score is retried rather than lost', async () => {
    const { dependencies, lines } = setUp(Promise.resolve({ status: 'finished', result: RESULT }), {
      publish: Promise.reject(new Error('rejected by EventBridge')),
    });

    await expect(checkMatch(INPUT, dependencies)).rejects.toThrow('rejected by EventBridge');

    expect(lines).toMatchObject([{ level: 'ERROR', matchId: MATCH_ID, error: { message: 'rejected by EventBridge' } }]);
  });

  it('logs and rethrows a failure to schedule the next attempt, so the check is retried rather than lost', async () => {
    const { dependencies, lines } = setUp(Promise.resolve({ status: 'not-finished' }), {
      schedule: Promise.reject(new Error('check 2 of 2026-11-01|Carcassonne|Lézignan not scheduled')),
    });

    await expect(checkMatch(INPUT, dependencies)).rejects.toThrow('not scheduled');

    expect(lines).toMatchObject([{ level: 'ERROR', message: 'match check failed', matchId: MATCH_ID }]);
  });

  it.each([
    ['an impossible date', { ...INPUT, date: '2026-02-30' }, 'real YYYY-MM-DD date'],
    ['no attempt', KEY, 'attempt must be a whole number from 1'],
  ])('logs an invalid input (%s) with the input itself, without looking anything up', async (_case, input, error) => {
    const { dependencies, lines } = setUp(Promise.resolve({ status: 'not-found' }));

    await expect(checkMatch(input, dependencies)).rejects.toThrow(error);

    expect(dependencies.getMatchResult).not.toHaveBeenCalled();
    expect(lines).toMatchObject([{ level: 'ERROR', message: 'invalid input', input }]);
  });
});
