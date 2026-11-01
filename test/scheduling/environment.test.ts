import { afterEach, describe, expect, it, vi } from 'vitest';
import { readMatchCheckDestination } from '../../src/scheduling/environment.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('readMatchCheckDestination', () => {
  it('reads the schedule group, the invoke role and the dead-letter queue', () => {
    vi.stubEnv('MATCH_CHECK_SCHEDULE_GROUP', 'final-whistle-match-checks');
    vi.stubEnv('MATCH_CHECK_ROLE_ARN', 'arn:aws:iam::123456789012:role/match-checks');
    vi.stubEnv('MATCH_CHECK_DEAD_LETTER_QUEUE_ARN', 'arn:aws:sqs:eu-west-3:123456789012:failures');

    expect(readMatchCheckDestination()).toEqual({
      scheduleGroupName: 'final-whistle-match-checks',
      roleArn: 'arn:aws:iam::123456789012:role/match-checks',
      deadLetterQueueArn: 'arn:aws:sqs:eu-west-3:123456789012:failures',
    });
  });

  it('fails with the name of a missing variable', () => {
    vi.stubEnv('MATCH_CHECK_SCHEDULE_GROUP', 'final-whistle-match-checks');
    vi.stubEnv('MATCH_CHECK_ROLE_ARN', 'arn:aws:iam::123456789012:role/match-checks');
    vi.stubEnv('MATCH_CHECK_DEAD_LETTER_QUEUE_ARN', '');

    expect(() => readMatchCheckDestination()).toThrow('MATCH_CHECK_DEAD_LETTER_QUEUE_ARN');
  });
});
