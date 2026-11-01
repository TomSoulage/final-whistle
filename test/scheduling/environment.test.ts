import { afterEach, describe, expect, it, vi } from 'vitest';
import { readMatchCheckDestination } from '../../src/scheduling/environment.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('readMatchCheckDestination', () => {
  it('reads the schedule group and the invoke role', () => {
    vi.stubEnv('MATCH_CHECK_SCHEDULE_GROUP', 'final-whistle-match-checks');
    vi.stubEnv('MATCH_CHECK_ROLE_ARN', 'arn:aws:iam::123456789012:role/match-checks');

    expect(readMatchCheckDestination()).toEqual({
      scheduleGroupName: 'final-whistle-match-checks',
      roleArn: 'arn:aws:iam::123456789012:role/match-checks',
    });
  });

  it('fails with the name of a missing variable', () => {
    vi.stubEnv('MATCH_CHECK_SCHEDULE_GROUP', 'final-whistle-match-checks');
    vi.stubEnv('MATCH_CHECK_ROLE_ARN', '');

    expect(() => readMatchCheckDestination()).toThrow('MATCH_CHECK_ROLE_ARN');
  });
});
