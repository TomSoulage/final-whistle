import { parse } from 'node-html-parser';
import { describe, expect, it } from 'vitest';
import {
  formatPageDay,
  getCellText,
  isFinishedMark,
  parseKickOff,
  parsePageDay,
  parseScore,
} from '../../../src/adapters/treize-mondial/parse-cells.js';

describe('getCellText', () => {
  it('decodes entities and collapses whitespace', () => {
    const cell = parse('<td> <strong>Toulouges &#8211;\n Baho</strong> </td>').querySelector('td');

    expect(cell && getCellText(cell)).toBe('Toulouges – Baho');
  });
});

describe('parsePageDay', () => {
  it.each([
    ['DIM. 01/11', { day: 1, month: 11 }],
    ['SAM. 31/10', { day: 31, month: 10 }],
  ])('reads %s', (text, expected) => {
    expect(parsePageDay(text)).toEqual(expected);
  });

  it.each(['🏉 RUGBY À XIII', '', '31/10'])('ignores %j', (text) => {
    expect(parsePageDay(text)).toBeNull();
  });
});

describe('formatPageDay', () => {
  it('writes the day and month as on the page', () => {
    expect(formatPageDay({ day: 1, month: 11 })).toBe('1/11');
  });
});

describe('parseKickOff', () => {
  it.each([
    ['5H40', '05:40'],
    ['17H00', '17:00'],
  ])('reads %s as %s', (text, expected) => {
    expect(parseKickOff(text)).toBe(expected);
  });

  it.each(['', 'REPORTÉ', '17h'])('gives null for %j', (text) => {
    expect(parseKickOff(text)).toBeNull();
  });
});

describe('parseScore', () => {
  it.each([
    ['0', 0],
    ['124', 124],
  ])('reads %s', (text, expected) => {
    expect(parseScore(text)).toBe(expected);
  });

  it.each(['–', '', '12a', '-3'])('gives null for %j', (text) => {
    expect(parseScore(text)).toBeNull();
  });
});

describe('isFinishedMark', () => {
  it.each(['✔', '✔\uFE0F'])('recognises %j', (text) => {
    expect(isFinishedMark(text)).toBe(true);
  });

  it.each(['MT', '📺', '', '✓'])('rejects %j', (text) => {
    expect(isFinishedMark(text)).toBe(false);
  });
});
