import { describe, expect, it } from 'vitest';
import {
  findMatchResult,
  isPageForDate,
} from '../../../src/adapters/treize-mondial/find-match-result.js';
import type { MatchesPage } from '../../../src/adapters/treize-mondial/parse-matches-page.js';

const PAGE: MatchesPage = {
  day: { day: 1, month: 11 },
  matches: [
    {
      competition: 'SUPER XIII',
      kickOff: '16:30',
      homeTeam: 'Carcassonne',
      awayTeam: 'Lézignan',
      finalScore: { homeScore: 22, awayScore: 18 },
    },
    {
      competition: 'DN1',
      kickOff: '15:00',
      homeTeam: 'Entraigues',
      awayTeam: 'Salses',
      finalScore: null,
    },
  ],
};

describe('findMatchResult', () => {
  it('returns the normalised result of a finished match', () => {
    const lookup = findMatchResult(PAGE, {
      date: '2026-11-01',
      homeTeam: 'Carcassonne',
      awayTeam: 'Lézignan',
    });

    expect(lookup).toEqual({
      status: 'finished',
      result: {
        date: '2026-11-01',
        homeTeam: 'Carcassonne',
        awayTeam: 'Lézignan',
        competition: 'SUPER XIII',
        homeScore: 22,
        awayScore: 18,
      },
    });
  });

  it('reports a match without a final score as not finished', () => {
    const lookup = findMatchResult(PAGE, { date: '2026-11-01', homeTeam: 'Entraigues', awayTeam: 'Salses' });

    expect(lookup).toEqual({ status: 'not-finished' });
  });

  it('does not find a match with the teams swapped', () => {
    const lookup = findMatchResult(PAGE, { date: '2026-11-01', homeTeam: 'Lézignan', awayTeam: 'Carcassonne' });

    expect(lookup).toEqual({ status: 'not-found' });
  });

  it('does not find a match on the page of another day', () => {
    const lookup = findMatchResult(PAGE, { date: '2026-10-31', homeTeam: 'Carcassonne', awayTeam: 'Lézignan' });

    expect(lookup).toEqual({ status: 'not-found' });
  });
});

describe('isPageForDate', () => {
  it('compares the day and month only, the page having no year', () => {
    expect(isPageForDate({ day: 1, month: 11 }, '2026-11-01')).toBe(true);
    expect(isPageForDate({ day: 1, month: 11 }, '2026-01-11')).toBe(false);
  });
});
