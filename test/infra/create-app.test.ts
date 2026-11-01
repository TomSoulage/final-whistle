import type { Stack } from 'aws-cdk-lib';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { describe, expect, it } from 'vitest';
import { APP_STACK_ID, createApp } from '../../infra/create-app.js';

/** A full synthesis bundles every Lambda, which can exceed the default 5 s under load. */
const SYNTH_TIMEOUT_MS = 30_000;

function getAppStack(app: ReturnType<typeof createApp>): Stack {
  return app.node.findChild(APP_STACK_ID) as Stack;
}

describe('createApp', () => {
  it('synthesizes the application stack without a cdk-nag violation', () => {
    expect(() => createApp().synth()).not.toThrow();
  }, SYNTH_TIMEOUT_MS);

  it('fails synthesis when a resource breaks a cdk-nag AWS Solutions rule', () => {
    const app = createApp();
    new Bucket(getAppStack(app), 'BucketWithoutAccessLogs');
    expect(() => app.synth()).toThrow(/AwsSolutions/);
  }, SYNTH_TIMEOUT_MS);
});
