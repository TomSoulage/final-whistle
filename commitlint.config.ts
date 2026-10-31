import type { UserConfig } from '@commitlint/types';

const DEPENDABOT_SIGN_OFF = /^Signed-off-by: dependabot\[bot\]/m;

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  // Dependabot bodies carry release notes longer than the body line limit.
  // Their header comes from dependabot.yml and the PR title is still linted.
  ignores: [(message) => DEPENDABOT_SIGN_OFF.test(message)],
};

export default config;
