import { parse, type HTMLElement } from 'node-html-parser';
import type { FinalScore } from '../../results/match-result.js';
import {
  formatPageDay,
  getCellText,
  isFinishedMark,
  parseKickOff,
  parsePageDay,
  parseScore,
  type PageDay,
} from './parse-cells.js';

export interface PageMatch {
  readonly competition: string;
  /** Local kick-off time, `HH:MM`, or null when the page does not give one. */
  readonly kickOff: string | null;
  readonly homeTeam: string;
  readonly awayTeam: string;
  /** Set only once the match is marked finished (✔) with both scores. */
  readonly finalScore: FinalScore | null;
}

export interface MatchesPage {
  readonly day: PageDay;
  readonly matches: readonly PageMatch[];
}

type Row = readonly HTMLElement[];

const COMPETITION_ROW_CELLS = 1;
const HOME_ROW_CELLS = 6;
const AWAY_ROW_CELLS = 4;

/** Parses the "matchs du jour" page. Throws when the layout is not the expected one. */
export function parseMatchesPage(html: string): MatchesPage {
  const rows: Row[] = parse(html)
    .querySelectorAll('tr')
    .map((row) => row.querySelectorAll('td'));
  return { day: findPageDay(rows), matches: parseMatchRows(rows) };
}

/** The page covers a single day: a missing header or a second, different one is an unknown layout. */
function findPageDay(rows: readonly Row[]): PageDay {
  const days = rows.map(getRowPageDay).filter((day) => day !== null);
  const [firstDay] = days;
  if (firstDay === undefined) {
    throw new Error('day header (e.g. "SAM. 31/10") not found');
  }
  if (days.some((day) => day.day !== firstDay.day || day.month !== firstDay.month)) {
    throw new Error(`several days on one page (${days.map(formatPageDay).join(', ')})`);
  }
  return firstDay;
}

function getRowPageDay(cells: Row): PageDay | null {
  return cells.map((cell) => parsePageDay(getCellText(cell))).find((day) => day !== null) ?? null;
}

function getRowCompetition(cells: Row): string | null {
  const [cell] = cells;
  return cells.length === COMPETITION_ROW_CELLS && cell !== undefined ? getCellText(cell) : null;
}

function parseMatchRows(rows: readonly Row[]): PageMatch[] {
  const matches: PageMatch[] = [];
  let competition: string | null = null;
  let index = 0;
  while (index < rows.length) {
    const cells = rows[index] ?? [];
    index += 1;
    if (getRowPageDay(cells) !== null) {
      continue;
    }
    const rowCompetition = getRowCompetition(cells);
    if (rowCompetition !== null) {
      competition = rowCompetition;
      continue;
    }
    matches.push(parseMatch(competition, cells, rows[index] ?? []));
    index += 1;
  }
  return matches;
}

function parseMatch(competition: string | null, homeRow: Row, awayRow: Row): PageMatch {
  if (competition === null || homeRow.length !== HOME_ROW_CELLS || awayRow.length !== AWAY_ROW_CELLS) {
    throw new Error(
      `unexpected match rows in "${competition ?? 'no competition'}" ` +
        `(${String(homeRow.length)} and ${String(awayRow.length)} cells, expected ` +
        `${String(HOME_ROW_CELLS)} and ${String(AWAY_ROW_CELLS)} after a competition row)`,
    );
  }
  const [kickOff = '', status = '', homeTeam = '', homeTotal = ''] = homeRow.map(getCellText);
  const [awayTeam = '', awayTotal = ''] = awayRow.map(getCellText);
  if (homeTeam === '' || awayTeam === '') {
    throw new Error(`match without a team name in "${competition}"`);
  }
  return {
    competition,
    kickOff: parseKickOff(kickOff),
    homeTeam,
    awayTeam,
    finalScore: isFinishedMark(status) ? parseFinalScore(homeTotal, awayTotal) : null,
  };
}

function parseFinalScore(homeTotal: string, awayTotal: string): FinalScore | null {
  const homeScore = parseScore(homeTotal);
  const awayScore = parseScore(awayTotal);
  return homeScore === null || awayScore === null ? null : { homeScore, awayScore };
}
