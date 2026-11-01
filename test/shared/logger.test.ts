import { describe, expect, it } from 'vitest';
import { createLogger, describeError } from '../../src/shared/logger.js';

function captureLines(): { readonly lines: unknown[]; readonly writeLine: (line: string) => void } {
  const lines: unknown[] = [];
  return { lines, writeLine: (line) => lines.push(JSON.parse(line)) };
}

describe('createLogger', () => {
  it('writes one JSON object per line, with the level, message, context and fields', () => {
    const { lines, writeLine } = captureLines();
    const logger = createLogger({ service: 'fetch-results', matchId: 'm1' }, writeLine);

    logger.info('match finished', { homeScore: 22 });
    logger.warn('match not found');
    logger.error('lookup failed');

    expect(lines).toEqual([
      { level: 'INFO', message: 'match finished', service: 'fetch-results', matchId: 'm1', homeScore: 22 },
      { level: 'WARN', message: 'match not found', service: 'fetch-results', matchId: 'm1' },
      { level: 'ERROR', message: 'lookup failed', service: 'fetch-results', matchId: 'm1' },
    ]);
  });

  it('keeps the context, level and message when a field has the same name', () => {
    const { lines, writeLine } = captureLines();
    const logger = createLogger({ matchId: 'm1' }, writeLine);

    logger.info('match finished', { matchId: 'other', level: 'DEBUG', message: 'other' });

    expect(lines).toEqual([{ level: 'INFO', message: 'match finished', matchId: 'm1' }]);
  });
});

describe('describeError', () => {
  it('keeps the name, message, stack and the chain of causes', () => {
    const cause = new TypeError('fetch failed');
    const description = describeError(new Error('Treize Mondial page: request failed', { cause }));

    expect(description).toMatchObject({
      name: 'Error',
      message: 'Treize Mondial page: request failed',
      stack: expect.any(String) as unknown,
      cause: { name: 'TypeError', message: 'fetch failed' },
    });
  });

  it('describes a thrown value that is not an Error', () => {
    expect(describeError('boom')).toEqual({ message: 'boom' });
  });
});
