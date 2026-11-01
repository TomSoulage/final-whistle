import { describe, expect, it } from 'vitest';
import {
  parseMatchesPage,
  type PageMatch,
} from '../../../src/adapters/treize-mondial/parse-matches-page.js';
import { readFixture } from '../../fixtures/treize-mondial/read-fixture.js';

function findMatch(matches: readonly PageMatch[], homeTeam: string): PageMatch | undefined {
  return matches.find((match) => match.homeTeam === homeTeam);
}

const DAY_HEADER = '<tr><td>🏉 RUGBY À XIII</td><td></td><td>DIM. 01/11</td><td></td></tr>';
const COMPETITION_ROW = '<tr><td colspan="7">DN1</td></tr>';
const HOME_ROW = '<tr><td>15H00</td><td>✔</td><td>Salses</td><td>&#8211;</td><td>0</td><td>0</td></tr>';
const AWAY_ROW = '<tr><td>Ferrals</td><td>12</td><td>6</td><td>6</td></tr>';

function page(...rows: string[]): string {
  return `<table>${rows.join('')}</table>`;
}

describe('parseMatchesPage on a page saved during the day', () => {
  const { day, matches } = parseMatchesPage(readFixture('2026-11-01-in-progress.html'));

  it('reads the day of the page header', () => {
    expect(day).toEqual({ day: 1, month: 11 });
  });

  it('reads every match of every competition', () => {
    expect(matches).toHaveLength(16);
    expect(new Set(matches.map((match) => match.competition))).toEqual(
      new Set(['COUPE DU MONDE 2026 – 3ÈME JOURNÉE', 'SUPER XIII', 'ÉLITE 2', 'DN1', 'DN2', 'DN3']),
    );
  });

  it('reads a finished match with its final score', () => {
    expect(findMatch(matches, 'Australie (F)')).toEqual({
      competition: 'COUPE DU MONDE 2026 – 3ÈME JOURNÉE',
      kickOff: '05:40',
      homeTeam: 'Australie (F)',
      awayTeam: 'Pays de Galles (F)',
      finalScore: { homeScore: 124, awayScore: 6 },
    });
  });

  it('gives no final score at half-time, even with a score shown', () => {
    expect(findMatch(matches, 'Liban')?.finalScore).toBeNull();
  });

  it('gives no final score to a match not started or shown on TV', () => {
    expect(findMatch(matches, 'Tonga')).toMatchObject({ kickOff: '10:05', finalScore: null });
    expect(findMatch(matches, 'Carcassonne')).toMatchObject({ kickOff: '16:30', finalScore: null });
  });

  it('keeps team names exactly as published, dashes and apostrophes included', () => {
    expect(findMatch(matches, 'Carpentras')?.awayTeam).toBe('Toulouges – Baho – Le Soler');
    expect(findMatch(matches, 'Trentels')?.awayTeam).toBe('Villefranche d’Albi');
  });
});

describe('parseMatchesPage on the previous day page, all finished', () => {
  const { day, matches } = parseMatchesPage(readFixture('2026-10-31-all-finished.html'));

  it('reads the day of the page header', () => {
    expect(day).toEqual({ day: 31, month: 10 });
  });

  it('gives a final score to every match', () => {
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((match) => match.finalScore !== null)).toBe(true);
  });

  it('reads the total only, even when the half-time scores do not add up', () => {
    expect(findMatch(matches, 'Saint-Estève XIII Catalan')?.finalScore).toEqual({
      homeScore: 24,
      awayScore: 38,
    });
  });
});

describe('parseMatchesPage on unusual pages', () => {
  it('returns no match on a day without matches', () => {
    expect(parseMatchesPage(page(DAY_HEADER)).matches).toEqual([]);
  });

  it('reads a match marked finished with the emoji form of ✔', () => {
    const emojiHomeRow = HOME_ROW.replace('✔', '✔\uFE0F').replace('&#8211;', '20');
    const { matches } = parseMatchesPage(page(DAY_HEADER, COMPETITION_ROW, emojiHomeRow, AWAY_ROW));

    expect(matches[0]?.finalScore).toEqual({ homeScore: 20, awayScore: 12 });
  });

  it('gives no final score when a finished match has a missing total', () => {
    const { matches } = parseMatchesPage(page(DAY_HEADER, COMPETITION_ROW, HOME_ROW, AWAY_ROW));

    expect(matches[0]?.finalScore).toBeNull();
  });

  it('fails when the day header is missing', () => {
    expect(() => parseMatchesPage('<p>Maintenance</p>')).toThrow('day header');
  });

  it('fails on a page covering several days', () => {
    const otherDayHeader = DAY_HEADER.replace('DIM. 01/11', 'LUN. 02/11');

    expect(() => parseMatchesPage(page(DAY_HEADER, COMPETITION_ROW, HOME_ROW, AWAY_ROW, otherDayHeader))).toThrow(
      'several days on one page (1/11, 2/11)',
    );
  });

  it('accepts the day header repeated for the same day', () => {
    expect(parseMatchesPage(page(DAY_HEADER, DAY_HEADER)).day).toEqual({ day: 1, month: 11 });
  });

  it('fails on a row of an unknown shape, naming the competition', () => {
    const unknownRow = '<tr><td>a</td><td>b</td></tr>';

    expect(() => parseMatchesPage(page(DAY_HEADER, COMPETITION_ROW, unknownRow))).toThrow(
      'unexpected match rows in "DN1" (2 and 0 cells',
    );
  });

  it('fails on a match listed before any competition', () => {
    expect(() => parseMatchesPage(page(DAY_HEADER, HOME_ROW, AWAY_ROW))).toThrow('no competition');
  });

  it('fails on a match without a team name', () => {
    const awayRowWithoutTeam = '<tr><td></td><td>12</td><td>6</td><td>6</td></tr>';

    expect(() =>
      parseMatchesPage(page(DAY_HEADER, COMPETITION_ROW, HOME_ROW, awayRowWithoutTeam)),
    ).toThrow('without a team name in "DN1"');
  });
});
