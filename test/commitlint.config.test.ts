import { describe, expect, it } from 'vitest';
import config from '../commitlint.config.js';

const DEPENDABOT_COMMIT = [
  'build(deps-dev): bump vitest from 5.0.5 to 5.1.0',
  '',
  'Bumps vitest from 5.0.5 to 5.1.0.',
  '',
  'Signed-off-by: dependabot[bot] <support@github.com>',
].join('\n');

const HUMAN_COMMIT_MENTIONING_DEPENDABOT = [
  'ci: tune dependabot schedule',
  '',
  'Signed-off-by: dependabot[bot] is how its commits are signed.',
].join(' ');

function isIgnored(message: string): boolean {
  return (config.ignores ?? []).some((isIgnoredBy) => isIgnoredBy(message));
}

describe('commitlint config', () => {
  it('skips commits signed off by Dependabot', () => {
    expect(isIgnored(DEPENDABOT_COMMIT)).toBe(true);
  });

  it('lints commits written by people', () => {
    expect(isIgnored('feat(notify): send the score to telegram')).toBe(false);
  });

  it('lints a commit that only mentions the Dependabot sign-off mid-line', () => {
    expect(isIgnored(HUMAN_COMMIT_MENTIONING_DEPENDABOT)).toBe(false);
  });
});
