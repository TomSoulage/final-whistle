import { describe, expect, it } from 'vitest';
import { parseMatchKey } from '../../src/results/parse-match-key.js';

const INPUT_NAME = 'fetch-results input';
const VALID_INPUT = { date: '2026-11-01', homeTeam: 'Carcassonne', awayTeam: 'Lézignan' };

describe('parseMatchKey', () => {
  it('returns the match key of a valid input, team names untouched', () => {
    expect(parseMatchKey({ ...VALID_INPUT, extra: 'ignored' }, INPUT_NAME)).toEqual(VALID_INPUT);
  });

  it.each([null, 'Carcassonne', 42, undefined])('rejects a non-object input %j', (input) => {
    expect(() => parseMatchKey(input, INPUT_NAME)).toThrow('fetch-results input: expected { date, homeTeam, awayTeam }');
  });

  it.each(['2026-02-30', '2026-13-01', '01/11/2026', '2026-1-1', '', 20261101])(
    'rejects the date %j',
    (date) => {
      expect(() => parseMatchKey({ ...VALID_INPUT, date }, INPUT_NAME)).toThrow('date must be a real YYYY-MM-DD date');
    },
  );

  it('accepts 29 February in a leap year only', () => {
    expect(parseMatchKey({ ...VALID_INPUT, date: '2028-02-29' }, INPUT_NAME).date).toBe('2028-02-29');
    expect(() => parseMatchKey({ ...VALID_INPUT, date: '2027-02-29' }, INPUT_NAME)).toThrow('real YYYY-MM-DD date');
  });

  it.each([
    { homeTeam: '' },
    { homeTeam: '   ' },
    { awayTeam: undefined },
    { awayTeam: 7 },
  ])('rejects the teams %j', (teams) => {
    expect(() => parseMatchKey({ ...VALID_INPUT, ...teams }, INPUT_NAME)).toThrow(
      'homeTeam and awayTeam must be non-empty strings',
    );
  });
});
