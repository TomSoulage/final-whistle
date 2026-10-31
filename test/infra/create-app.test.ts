import type { Stack } from 'aws-cdk-lib';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { describe, expect, it } from 'vitest';
import { APP_STACK_ID, createApp } from '../../infra/create-app.js';

function getAppStack(app: ReturnType<typeof createApp>): Stack {
  return app.node.findChild(APP_STACK_ID) as Stack;
}

describe('createApp', () => {
  it('synthesizes the application stack', () => {
    const assembly = createApp().synth();
    expect(assembly.getStackByName(APP_STACK_ID).template).toBeDefined();
  });

  it('fails synthesis when a resource breaks a cdk-nag AWS Solutions rule', () => {
    const app = createApp();
    new Bucket(getAppStack(app), 'BucketWithoutAccessLogs');
    expect(() => app.synth()).toThrow(/AwsSolutions/);
  });
});
