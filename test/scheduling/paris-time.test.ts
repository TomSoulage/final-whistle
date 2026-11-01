import { describe, expect, it } from 'vitest';
import {
  formatParisWallClock,
  getParisDate,
  parseParisWallClock,
  toParisWallClock,
} from '../../src/scheduling/paris-time.js';

describe('toParisWallClock', () => {
  it.each([
    ['winter time (UTC+1)', '2026-11-01T09:00:00Z', '2026-11-01T10:00:00'],
    ['summer time (UTC+2)', '2026-07-01T08:00:00Z', '2026-07-01T10:00:00'],
    ['the next Paris day before midnight UTC', '2026-10-31T23:30:15Z', '2026-11-01T00:30:15'],
  ])('reads %s', (_case, instant, expected) => {
    expect(formatParisWallClock(toParisWallClock(new Date(instant)))).toBe(expected);
  });
});

describe('parseParisWallClock', () => {
  it('reads a page date and kick-off time', () => {
    expect(formatParisWallClock(parseParisWallClock('2026-11-01', '15:00'))).toBe('2026-11-01T15:00:00');
  });

  it.each(['25:00', '01:70'])('fails on the impossible time %s', (time) => {
    expect(() => parseParisWallClock('2026-11-01', time)).toThrow(`invalid Paris wall clock "2026-11-01 ${time}"`);
  });
});

describe('getParisDate', () => {
  it('gives the date of a wall clock', () => {
    expect(getParisDate(toParisWallClock(new Date('2026-10-31T23:30:00Z')))).toBe('2026-11-01');
  });
});
