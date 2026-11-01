import { describe, expect, it } from 'vitest';
import { buildMatchFinishedEntry } from '../../src/events/match-finished.js';

describe('buildMatchFinishedEntry', () => {
  it('builds the MatchFinished entry, its detail carrying the match id and the result', () => {
    const entry = buildMatchFinishedEntry('final-whistle', {
      date: '2026-11-01',
      homeTeam: 'Carcassonne',
      awayTeam: 'Lézignan',
      competition: 'SUPER XIII',
      homeScore: 22,
      awayScore: 18,
    });

    expect(entry).toMatchObject({
      EventBusName: 'final-whistle',
      Source: 'final-whistle.fetch-results',
      DetailType: 'MatchFinished',
    });
    expect(JSON.parse(entry.Detail ?? '')).toEqual({
      matchId: '2026-11-01|Carcassonne|Lézignan',
      date: '2026-11-01',
      homeTeam: 'Carcassonne',
      awayTeam: 'Lézignan',
      competition: 'SUPER XIII',
      homeScore: 22,
      awayScore: 18,
    });
  });
});
