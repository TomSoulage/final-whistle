import { App, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { FinalWhistleStack } from './final-whistle-stack.js';

export const APP_STACK_ID = 'FinalWhistle';

/** Builds the CDK app with the cdk-nag AWS Solutions rules: a violation fails `cdk synth`. */
export function createApp(): App {
  const app = new App();
  new FinalWhistleStack(app, APP_STACK_ID);
  Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
  return app;
}
