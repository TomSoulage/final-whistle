import { describe, expect, it } from 'vitest';
import { buildMatchFinishedEntry, parseMatchFinishedEvent } from '../../src/events/match-finished.js';

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

describe('parseMatchFinishedEvent', () => {
  const DETAIL = {
    matchId: '2026-11-01|Carcassonne|Lézignan',
    date: '2026-11-01',
    homeTeam: 'Carcassonne',
    awayTeam: 'Lézignan',
    competition: 'SUPER XIII',
    homeScore: 22,
    awayScore: 18,
  };
  const EVENT = { 'detail-type': 'MatchFinished', source: 'final-whistle.fetch-results', detail: DETAIL };

  it('returns the detail of a valid event, names untouched', () => {
    expect(parseMatchFinishedEvent(EVENT)).toEqual(DETAIL);
  });

  it('accepts a 0–0 score', () => {
    const event = { ...EVENT, detail: { ...DETAIL, homeScore: 0, awayScore: 0 } };
    expect(parseMatchFinishedEvent(event)).toMatchObject({ homeScore: 0, awayScore: 0 });
  });

  it.each([null, 'MatchFinished', {}, { detail: null }])('rejects an event without a detail object: %j', (event) => {
    expect(() => parseMatchFinishedEvent(event)).toThrow('MatchFinished detail: expected { date, homeTeam, awayTeam }');
  });

  it('rejects an invalid match key, naming the detail', () => {
    const event = { ...EVENT, detail: { ...DETAIL, date: '2026-02-30' } };
    expect(() => parseMatchFinishedEvent(event)).toThrow('MatchFinished detail: date must be a real YYYY-MM-DD date');
  });

  it.each([{ matchId: '' }, { matchId: undefined }, { competition: '  ' }, { competition: 13 }])(
    'rejects the fields %j',
    (fields) => {
      const event = { ...EVENT, detail: { ...DETAIL, ...fields } };
      expect(() => parseMatchFinishedEvent(event)).toThrow('matchId and competition must be non-empty strings');
    },
  );

  it.each([{ homeScore: -1 }, { awayScore: 2.5 }, { homeScore: '22' }, { awayScore: undefined }])(
    'rejects the score %j, naming the match',
    (score) => {
      const event = { ...EVENT, detail: { ...DETAIL, ...score } };
      expect(() => parseMatchFinishedEvent(event)).toThrow(
        'MatchFinished detail for 2026-11-01|Carcassonne|Lézignan: scores must be whole numbers ≥ 0',
      );
    },
  );
});
