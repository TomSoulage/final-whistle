import { describe, expect, it } from 'vitest';
import { buildMatchId } from '../../src/results/match-result.js';

describe('buildMatchId', () => {
  it('joins the date and both teams as published', () => {
    const matchId = buildMatchId({
      date: '2026-10-30',
      homeTeam: 'Angleterre',
      awayTeam: 'Papouasie-Nouvelle-Guinée',
    });

    expect(matchId).toBe('2026-10-30|Angleterre|Papouasie-Nouvelle-Guinée');
  });
});
