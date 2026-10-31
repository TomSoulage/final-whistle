import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const MAX_FUNCTION_LINES = 30;
const MAX_NESTING_DEPTH = 3;
const ALLOWED_PLAIN_NUMBERS = [-1, 0, 1];

export default defineConfig(
  { ignores: ['node_modules/', 'dist/', 'cdk.out/', 'coverage/'] },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'max-lines-per-function': [
        'error',
        { max: MAX_FUNCTION_LINES, skipBlankLines: true, skipComments: true },
      ],
      'max-depth': ['error', MAX_NESTING_DEPTH],
      'no-magic-numbers': 'off',
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: ALLOWED_PLAIN_NUMBERS,
          ignoreEnums: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
          enforceConst: true,
        },
      ],
      'no-param-reassign': ['error', { props: true }],
      'prefer-const': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      'no-console': 'error',
      'no-empty': 'error',
    },
  },
  {
    files: ['test/**/*.ts', '**/*.test.ts'],
    rules: {
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },
);
