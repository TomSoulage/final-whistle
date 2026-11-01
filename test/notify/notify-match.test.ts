import { describe, expect, it } from 'vitest';
import { notifyMatch, type NotifyMatchDependencies } from '../../src/notify/notify-match.js';
import type { RememberOutcome } from '../../src/notify/sent-matches.js';
import { captureLogs } from '../capture-logs.js';

const MATCH_ID = '2026-11-01|Carcassonne|Lézignan';
const DETAIL = {
  matchId: MATCH_ID,
  date: '2026-11-01',
  homeTeam: 'Carcassonne',
  awayTeam: 'Lézignan',
  competition: 'SUPER XIII',
  homeScore: 22,
  awayScore: 18,
};
const EVENT = { 'detail-type': 'MatchFinished', source: 'final-whistle.fetch-results', detail: DETAIL };
const MESSAGE = 'Score final · SUPER XIII\nCarcassonne 22 – 18 Lézignan';

interface Outcomes {
  readonly isAlreadySent?: Promise<boolean>;
  readonly sendMessage?: Promise<void>;
  readonly rememberSent?: Promise<RememberOutcome>;
}

/** Records every call in order, so the check → send → remember sequence can be asserted. */
function setUp(outcomes: Outcomes = {}) {
  const calls: unknown[][] = [];
  const { lines, createLogger } = captureLogs();
  const dependencies: NotifyMatchDependencies = {
    isAlreadySent: (matchId) => {
      calls.push(['isAlreadySent', matchId]);
      return outcomes.isAlreadySent ?? Promise.resolve(false);
    },
    sendMessage: (text, matchId) => {
      calls.push(['sendMessage', text, matchId]);
      return outcomes.sendMessage ?? Promise.resolve();
    },
    rememberSent: (matchId) => {
      calls.push(['rememberSent', matchId]);
      return outcomes.rememberSent ?? Promise.resolve('recorded');
    },
    createLogger,
  };
  return { dependencies, calls, lines };
}

describe('notifyMatch', () => {
  it('checks, sends, then remembers the score, and logs it with the match id', async () => {
    const { dependencies, calls, lines } = setUp();

    await expect(notifyMatch(EVENT, dependencies)).resolves.toBe('sent');

    expect(calls).toEqual([
      ['isAlreadySent', MATCH_ID],
      ['sendMessage', MESSAGE, MATCH_ID],
      ['rememberSent', MATCH_ID],
    ]);
    expect(lines).toEqual([
      { level: 'INFO', message: 'score sent', matchId: MATCH_ID, competition: 'SUPER XIII', homeScore: 22, awayScore: 18 },
    ]);
  });

  it('sends nothing for a score already sent', async () => {
    const { dependencies, calls, lines } = setUp({ isAlreadySent: Promise.resolve(true) });

    await expect(notifyMatch(EVENT, dependencies)).resolves.toBe('already-sent');

    expect(calls).toEqual([['isAlreadySent', MATCH_ID]]);
    expect(lines).toEqual([{ level: 'INFO', message: 'score already sent, skipped', matchId: MATCH_ID }]);
  });

  it('warns when another invocation recorded the same score meanwhile', async () => {
    const { dependencies, lines } = setUp({ rememberSent: Promise.resolve('already-recorded') });

    await expect(notifyMatch(EVENT, dependencies)).resolves.toBe('sent');

    expect(lines).toMatchObject([
      { level: 'WARN', message: 'duplicate sent', matchId: MATCH_ID },
      { level: 'INFO', message: 'score sent' },
    ]);
  });

  it('does not remember a score that failed to send, and rethrows for a retry', async () => {
    const { dependencies, calls, lines } = setUp({ sendMessage: Promise.reject(new Error('Telegram: HTTP 502')) });

    await expect(notifyMatch(EVENT, dependencies)).rejects.toThrow('HTTP 502');

    expect(calls.map(([name]) => name)).toEqual(['isAlreadySent', 'sendMessage']);
    expect(lines).toMatchObject([
      { level: 'ERROR', message: 'score notification failed', matchId: MATCH_ID, error: { message: 'Telegram: HTTP 502' } },
    ]);
  });

  it('rethrows a failure to remember, so the retry sends again rather than losing the score', async () => {
    const { dependencies, lines } = setUp({ rememberSent: Promise.reject(new Error('DynamoDB throttled')) });

    await expect(notifyMatch(EVENT, dependencies)).rejects.toThrow('DynamoDB throttled');

    expect(lines).toMatchObject([{ level: 'ERROR', matchId: MATCH_ID, error: { message: 'DynamoDB throttled' } }]);
  });

  it('sends nothing when the check fails', async () => {
    const { dependencies, calls } = setUp({ isAlreadySent: Promise.reject(new Error('DynamoDB unavailable')) });

    await expect(notifyMatch(EVENT, dependencies)).rejects.toThrow('DynamoDB unavailable');

    expect(calls.map(([name]) => name)).toEqual(['isAlreadySent']);
  });

  it('logs an invalid event with the event itself, without checking or sending anything', async () => {
    const { dependencies, calls, lines } = setUp();
    const event = { ...EVENT, detail: { ...DETAIL, homeScore: -1 } };

    await expect(notifyMatch(event, dependencies)).rejects.toThrow('scores must be whole numbers');

    expect(calls).toEqual([]);
    expect(lines).toMatchObject([{ level: 'ERROR', message: 'invalid MatchFinished event', event }]);
  });
});
