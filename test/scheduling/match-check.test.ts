import { describe, expect, it } from 'vitest';
import { parseMatchCheck } from '../../src/scheduling/match-check.js';

const KEY = { date: '2026-11-01', homeTeam: 'Carcassonne', awayTeam: 'Lézignan' };

describe('parseMatchCheck', () => {
  it('reads the match key and the attempt', () => {
    expect(parseMatchCheck({ ...KEY, attempt: 3 }, 'test input')).toEqual({ ...KEY, attempt: 3 });
  });

  it.each([undefined, 0, 1.5, '2', null])('rejects the attempt %j', (attempt) => {
    expect(() => parseMatchCheck({ ...KEY, attempt }, 'test input')).toThrow(
      `test input: attempt must be a whole number from 1, got ${JSON.stringify(attempt)}`,
    );
  });

  it('rejects an invalid match key first', () => {
    expect(() => parseMatchCheck({ ...KEY, homeTeam: '', attempt: 1 }, 'test input')).toThrow('homeTeam and awayTeam');
  });
});
