import { describe, expect, it } from 'vitest';
import type { DayMatch } from '../../src/results/match-result.js';
import { formatParisWallClock, parseParisWallClock, type ParisWallClock } from '../../src/scheduling/paris-time.js';
import { moveOutOfQuietHours, planFirstCheck, planRetry } from '../../src/scheduling/plan-check-time.js';

/** 10:00 in Paris, when the planner runs. */
const PLANNER_RUN = new Date('2026-11-01T09:00:00Z');

function matchAt(kickOff: string | null): DayMatch {
  return { key: { date: '2026-11-01', homeTeam: 'Carcassonne', awayTeam: 'Lézignan' }, kickOff };
}

describe('planFirstCheck', () => {
  it.each([
    ['2 h after kick-off', '15:00', '2026-11-01T17:00:00'],
    ['at 17:00 when the kick-off time is missing', null, '2026-11-01T17:00:00'],
    ['just after now when 2 h after kick-off has passed', '05:40', '2026-11-01T10:01:00'],
    ['late in the evening, before the quiet hours', '20:30', '2026-11-01T22:30:00'],
    ['the next morning when 2 h after kick-off falls in the quiet hours', '21:30', '2026-11-02T08:00:00'],
    ['the next morning when 2 h after kick-off is past midnight', '22:15', '2026-11-02T08:00:00'],
  ])('checks %s', (_case, kickOff, expected) => {
    expect(formatParisWallClock(planFirstCheck(matchAt(kickOff), PLANNER_RUN))).toBe(expected);
  });
});

describe('moveOutOfQuietHours', () => {
  it.each([
    ['22:59', '2026-11-01T22:59:00'],
    ['23:00', '2026-11-02T08:00:00'],
    ['02:00', '2026-11-01T08:00:00'],
    ['07:59', '2026-11-01T08:00:00'],
    ['08:00', '2026-11-01T08:00:00'],
  ])('moves %s to %s', (time, expected) => {
    expect(formatParisWallClock(moveOutOfQuietHours(parseParisWallClock('2026-11-01', time)))).toBe(expected);
  });
});

describe('planRetry', () => {
  /** The instant at which a Paris wall clock of winter time (UTC+1) is reached. */
  function instantOf(wallClock: ParisWallClock): Date {
    return new Date(wallClock.getTime() - 3_600_000);
  }

  it('checks the evening hourly, then less and less often until the next afternoon, then gives up', () => {
    let checkAt: ParisWallClock | null = parseParisWallClock('2026-11-01', '17:00');
    const checks: string[] = [];
    for (let attempt = 1; checkAt !== null; attempt += 1) {
      checks.push(formatParisWallClock(checkAt));
      checkAt = planRetry(attempt, instantOf(checkAt));
    }

    expect(checks).toEqual([
      '2026-11-01T17:00:00',
      '2026-11-01T18:00:00',
      '2026-11-01T19:00:00',
      '2026-11-01T20:00:00',
      '2026-11-01T22:00:00',
      '2026-11-02T08:00:00',
      '2026-11-02T16:00:00',
    ]);
  });

  it('gives up after the 7th attempt', () => {
    expect(planRetry(7, new Date('2026-11-01T16:00:00Z'))).toBeNull();
  });
});
