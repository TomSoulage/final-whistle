import { describe, expect, it, vi } from 'vitest';
import { planDay, type PlanDayDependencies } from '../../src/planner/plan-day.js';
import type { DayMatch } from '../../src/results/match-result.js';
import { formatParisWallClock } from '../../src/scheduling/paris-time.js';
import { captureLogs } from '../capture-logs.js';

/** 10:00 in Paris, when the planner runs. */
const NOW = new Date('2026-11-01T09:00:00Z');
const AFTERNOON_MATCH: DayMatch = {
  key: { date: '2026-11-01', homeTeam: 'Carcassonne', awayTeam: 'Lézignan' },
  kickOff: '15:00',
};
const UNTIMED_MATCH: DayMatch = {
  key: { date: '2026-11-01', homeTeam: 'Limoux', awayTeam: 'Albi' },
  kickOff: null,
};

function setUp(
  matches: Promise<readonly DayMatch[]>,
  scheduleMatchCheck: PlanDayDependencies['scheduleMatchCheck'] = () => Promise.resolve('created'),
) {
  const { lines, createLogger } = captureLogs();
  const dependencies = {
    listDayMatches: vi.fn<PlanDayDependencies['listDayMatches']>(() => matches),
    scheduleMatchCheck: vi.fn(scheduleMatchCheck),
    createLogger,
    now: () => NOW,
  };
  return { dependencies, lines };
}

describe('planDay', () => {
  it('schedules a check 2 h after kick-off for each match of the Paris day', async () => {
    const { dependencies, lines } = setUp(Promise.resolve([AFTERNOON_MATCH]));

    await expect(planDay(dependencies)).resolves.toEqual({ date: '2026-11-01', matchCount: 1 });

    expect(dependencies.listDayMatches).toHaveBeenCalledWith('2026-11-01');
    const [key, checkAt] = dependencies.scheduleMatchCheck.mock.calls[0] ?? [];
    expect(key).toEqual(AFTERNOON_MATCH.key);
    expect(checkAt && formatParisWallClock(checkAt)).toBe('2026-11-01T17:00:00');
    expect(lines).toEqual([
      {
        level: 'INFO',
        message: 'match check scheduled',
        matchId: '2026-11-01|Carcassonne|Lézignan',
        kickOff: '15:00',
        checkAt: '2026-11-01T17:00:00',
        outcome: 'created',
      },
      { level: 'INFO', message: 'day planned', date: '2026-11-01', matchCount: 1, failedCount: 0 },
    ]);
  });

  it('warns when the kick-off time is missing and checks at the fallback time', async () => {
    const { dependencies, lines } = setUp(Promise.resolve([UNTIMED_MATCH]));

    await planDay(dependencies);

    expect(lines[0]).toEqual({
      level: 'WARN',
      message: 'kick-off time missing, fallback check time used',
      matchId: '2026-11-01|Limoux|Albi',
      kickOff: null,
      checkAt: '2026-11-01T17:00:00',
    });
  });

  it('logs a match already scheduled as such, so the planner can run twice', async () => {
    const { dependencies, lines } = setUp(Promise.resolve([AFTERNOON_MATCH]), () =>
      Promise.resolve('already-scheduled'),
    );

    await planDay(dependencies);

    expect(lines[0]).toMatchObject({ message: 'match check scheduled', outcome: 'already-scheduled' });
  });

  it('schedules nothing on a day without matches', async () => {
    const { dependencies, lines } = setUp(Promise.resolve([]));

    await expect(planDay(dependencies)).resolves.toEqual({ date: '2026-11-01', matchCount: 0 });

    expect(dependencies.scheduleMatchCheck).not.toHaveBeenCalled();
    expect(lines).toEqual([{ level: 'INFO', message: 'day planned', date: '2026-11-01', matchCount: 0, failedCount: 0 }]);
  });

  it('schedules the other matches when one fails, then fails for a retry', async () => {
    const { dependencies, lines } = setUp(Promise.resolve([AFTERNOON_MATCH, UNTIMED_MATCH]), (key) =>
      key.homeTeam === 'Carcassonne' ? Promise.reject(new Error('throttled')) : Promise.resolve('created'),
    );

    await expect(planDay(dependencies)).rejects.toThrow('1 of 2 match checks not scheduled for 2026-11-01');

    expect(dependencies.scheduleMatchCheck).toHaveBeenCalledTimes(2);
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: 'ERROR',
        message: 'match check not scheduled',
        matchId: '2026-11-01|Carcassonne|Lézignan',
        error: expect.objectContaining({ message: 'throttled' }) as unknown,
      }),
    );
    expect(lines.at(-1)).toMatchObject({ message: 'day planned', matchCount: 2, failedCount: 1 });
  });

  it('logs an impossible kick-off time with the match id and still schedules the other matches', async () => {
    const impossibleMatch: DayMatch = { ...AFTERNOON_MATCH, kickOff: '25:00' };
    const { dependencies, lines } = setUp(Promise.resolve([impossibleMatch, UNTIMED_MATCH]));

    await expect(planDay(dependencies)).rejects.toThrow('1 of 2 match checks not scheduled for 2026-11-01');

    expect(dependencies.scheduleMatchCheck).toHaveBeenCalledExactlyOnceWith(UNTIMED_MATCH.key, expect.any(Date));
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: 'ERROR',
        message: 'match check not scheduled',
        matchId: '2026-11-01|Carcassonne|Lézignan',
        kickOff: '25:00',
      }),
    );
  });

  it('logs a page that cannot be read, then rethrows it for a retry', async () => {
    const { dependencies, lines } = setUp(Promise.reject(new Error('page shows 31/10, not 2026-11-01')));

    await expect(planDay(dependencies)).rejects.toThrow('page shows 31/10');

    expect(dependencies.scheduleMatchCheck).not.toHaveBeenCalled();
    expect(lines).toEqual([
      expect.objectContaining({ level: 'ERROR', message: 'matches of the day not read', date: '2026-11-01' }),
    ]);
  });
});
