import { describe, expect, it, vi } from 'vitest';
import { checkMatch, type CheckMatchDependencies } from '../../src/fetch-results/check-match.js';
import type { MatchLookup } from '../../src/results/match-result.js';
import { createLogger } from '../../src/shared/logger.js';

const INPUT = { date: '2026-11-01', homeTeam: 'Carcassonne', awayTeam: 'Lézignan' };
const MATCH_ID = '2026-11-01|Carcassonne|Lézignan';
const RESULT = { ...INPUT, competition: 'SUPER XIII', homeScore: 22, awayScore: 18 };

function setUp(lookup: Promise<MatchLookup>, publish: Promise<void> = Promise.resolve()) {
  const lines: Record<string, unknown>[] = [];
  const dependencies = {
    getMatchResult: vi.fn<CheckMatchDependencies['getMatchResult']>(() => lookup),
    publishMatchFinished: vi.fn<CheckMatchDependencies['publishMatchFinished']>(() => publish),
    createLogger: (context: Record<string, unknown>) =>
      createLogger(context, (line) => lines.push(JSON.parse(line) as Record<string, unknown>)),
  };
  return { dependencies, lines };
}

describe('checkMatch', () => {
  it('publishes the result of a finished match and logs it with the match id', async () => {
    const { dependencies, lines } = setUp(Promise.resolve({ status: 'finished', result: RESULT }));

    await expect(checkMatch(INPUT, dependencies)).resolves.toBe('finished');

    expect(dependencies.getMatchResult).toHaveBeenCalledWith(INPUT);
    expect(dependencies.publishMatchFinished).toHaveBeenCalledWith(RESULT);
    expect(lines).toEqual([
      {
        level: 'INFO',
        message: 'match finished, result published',
        matchId: MATCH_ID,
        competition: 'SUPER XIII',
        homeScore: 22,
        awayScore: 18,
      },
    ]);
  });

  it('publishes nothing for a match not finished yet', async () => {
    const { dependencies, lines } = setUp(Promise.resolve({ status: 'not-finished' }));

    await expect(checkMatch(INPUT, dependencies)).resolves.toBe('not-finished');

    expect(dependencies.publishMatchFinished).not.toHaveBeenCalled();
    expect(lines).toEqual([{ level: 'INFO', message: 'match not finished yet', matchId: MATCH_ID }]);
  });

  it('publishes nothing and warns for a match not found', async () => {
    const { dependencies, lines } = setUp(Promise.resolve({ status: 'not-found' }));

    await expect(checkMatch(INPUT, dependencies)).resolves.toBe('not-found');

    expect(dependencies.publishMatchFinished).not.toHaveBeenCalled();
    expect(lines).toEqual([{ level: 'WARN', message: 'match not found on the source page', matchId: MATCH_ID }]);
  });

  it('logs a lookup failure with the match id, then rethrows it for a retry', async () => {
    const { dependencies, lines } = setUp(Promise.reject(new Error('Treize Mondial page: HTTP 503')));

    await expect(checkMatch(INPUT, dependencies)).rejects.toThrow('HTTP 503');

    expect(lines).toMatchObject([
      { level: 'ERROR', message: 'match check failed', matchId: MATCH_ID, error: { message: 'Treize Mondial page: HTTP 503' } },
    ]);
  });

  it('logs and rethrows a publish failure, so the score is retried rather than lost', async () => {
    const { dependencies, lines } = setUp(
      Promise.resolve({ status: 'finished', result: RESULT }),
      Promise.reject(new Error('rejected by EventBridge')),
    );

    await expect(checkMatch(INPUT, dependencies)).rejects.toThrow('rejected by EventBridge');

    expect(lines).toMatchObject([{ level: 'ERROR', matchId: MATCH_ID, error: { message: 'rejected by EventBridge' } }]);
  });

  it('logs an invalid input with the input itself, without looking anything up', async () => {
    const { dependencies, lines } = setUp(Promise.resolve({ status: 'not-found' }));
    const input = { date: '2026-02-30', homeTeam: 'Carcassonne', awayTeam: 'Lézignan' };

    await expect(checkMatch(input, dependencies)).rejects.toThrow('real YYYY-MM-DD date');

    expect(dependencies.getMatchResult).not.toHaveBeenCalled();
    expect(lines).toMatchObject([{ level: 'ERROR', message: 'invalid input', input }]);
  });
});
