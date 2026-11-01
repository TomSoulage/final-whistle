import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_STACK_ID } from '../../infra/create-app.js';

const PACKAGE_JSON_URL = new URL('../../package.json', import.meta.url);

function getDeployScript(): string | undefined {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_URL, 'utf8')) as {
    scripts: Record<string, string>;
  };
  return packageJson.scripts.deploy;
}

describe('npm run deploy', () => {
  // D23: the pipeline deploys the application stack only, never the GitHub OIDC stack
  // that holds its own trust. CI cannot answer an approval prompt, hence `never`.
  it('deploys the application stack only, without an interactive approval', () => {
    expect(getDeployScript()).toBe(`cdk deploy ${APP_STACK_ID} --require-approval never --no-color`);
  });
});
