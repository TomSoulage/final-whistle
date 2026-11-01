import { describe, expect, it } from 'vitest';
import { formatScoreMessage } from '../../src/notify/format-score-message.js';

const RESULT = {
  date: '2026-11-01',
  homeTeam: 'Carcassonne',
  awayTeam: 'Lézignan',
  competition: 'SUPER XIII',
  homeScore: 22,
  awayScore: 18,
};

describe('formatScoreMessage', () => {
  it('shows the competition, then the home team, both scores and the away team', () => {
    expect(formatScoreMessage(RESULT)).toBe('Score final · SUPER XIII\nCarcassonne 22 – 18 Lézignan');
  });

  it('keeps names exactly as published, characters used by Telegram formatting included', () => {
    const result = { ...RESULT, homeTeam: 'St_Estève *XIII* [Catalan]', competition: 'Élite 1 - Poule_A' };
    expect(formatScoreMessage(result)).toBe('Score final · Élite 1 - Poule_A\nSt_Estève *XIII* [Catalan] 22 – 18 Lézignan');
  });
});
