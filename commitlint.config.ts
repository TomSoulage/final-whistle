import { RuleConfigSeverity, type UserConfig } from '@commitlint/types';

const MAX_HEADER_LENGTH = 72;
const DEPENDABOT_SIGN_OFF = /^Signed-off-by: dependabot\[bot\]/m;

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [RuleConfigSeverity.Error, 'always', MAX_HEADER_LENGTH],
  },
  // Dependabot bodies carry release notes longer than the body line limit.
  // Their header comes from dependabot.yml and the PR title is still linted.
  ignores: [(message) => DEPENDABOT_SIGN_OFF.test(message)],
};

export default config;
