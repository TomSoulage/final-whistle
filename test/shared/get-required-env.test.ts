import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRequiredEnv } from '../../src/shared/get-required-env.js';

describe('getRequiredEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the value of a set variable', () => {
    vi.stubEnv('EVENT_BUS_NAME', 'final-whistle');

    expect(getRequiredEnv('EVENT_BUS_NAME')).toBe('final-whistle');
  });

  it.each([undefined, ''])('fails with the variable name when it is %j', (value) => {
    vi.stubEnv('EVENT_BUS_NAME', value);

    expect(() => getRequiredEnv('EVENT_BUS_NAME')).toThrow('Environment variable EVENT_BUS_NAME is not set');
  });
});
