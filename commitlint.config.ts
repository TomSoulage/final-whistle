import { RuleConfigSeverity, type UserConfig } from '@commitlint/types';

const MAX_HEADER_LENGTH = 72;

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [RuleConfigSeverity.Error, 'always', MAX_HEADER_LENGTH],
  },
};

export default config;
