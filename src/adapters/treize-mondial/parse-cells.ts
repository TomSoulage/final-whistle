import type { HTMLElement } from 'node-html-parser';

/** Day and month of the page header, e.g. `SAM. 31/10`; the page does not show the year. */
export interface PageDay {
  readonly day: number;
  readonly month: number;
}

const PAGE_DAY_PATTERN = /^(?:LUN|MAR|MER|JEU|VEN|SAM|DIM)\.\s*(?<day>\d{2})\/(?<month>\d{2})$/u;
const KICK_OFF_PATTERN = /^(?<hours>\d{1,2})H(?<minutes>\d{2})$/u;
const SCORE_PATTERN = /^\d+$/u;
const HOURS_WIDTH = 2;
const FINISHED_MARK = '✔';
/** Appended to `✔`, it gives the emoji form `✔️`; editors paste either. */
const EMOJI_VARIATION_SELECTOR = /️/gu;

/** The status cell of a finished match: `✔`, in its text or emoji form. */
export function isFinishedMark(text: string): boolean {
  return text.replace(EMOJI_VARIATION_SELECTOR, '') === FINISHED_MARK;
}

/** Decoded text of a cell, trimmed, with runs of whitespace collapsed to one space. */
export function getCellText(cell: HTMLElement): string {
  return cell.text.replace(/\s+/gu, ' ').trim();
}

export function parsePageDay(text: string): PageDay | null {
  const groups = PAGE_DAY_PATTERN.exec(text)?.groups;
  if (groups?.day === undefined || groups.month === undefined) {
    return null;
  }
  return { day: Number(groups.day), month: Number(groups.month) };
}

/** `5H40` → `05:40`; anything else (postponed, not set yet) → null. */
export function parseKickOff(text: string): string | null {
  const groups = KICK_OFF_PATTERN.exec(text)?.groups;
  if (groups?.hours === undefined || groups.minutes === undefined) {
    return null;
  }
  return `${groups.hours.padStart(HOURS_WIDTH, '0')}:${groups.minutes}`;
}

/** A score is a whole number; the page shows `–` until it is known. */
export function parseScore(text: string): number | null {
  return SCORE_PATTERN.test(text) ? Number(text) : null;
}
