import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { EVENT_BUS_NAME, FinalWhistleStack } from '../../infra/final-whistle-stack.js';

let template: Template;

beforeAll(() => {
  template = Template.fromStack(new FinalWhistleStack(new App(), 'TestFinalWhistle'));
});

function getLogicalId(type: string): string {
  const [logicalId, ...others] = Object.keys(template.findResources(type));
  if (logicalId === undefined || others.length > 0) {
    throw new Error(`Expected exactly one ${type} in the template`);
  }
  return logicalId;
}

describe('FinalWhistleStack', () => {
  it('creates the event bus that MatchFinished is published on', () => {
    template.resourceCountIs('AWS::Events::EventBus', 1);
    template.hasResourceProperties('AWS::Events::EventBus', { Name: EVENT_BUS_NAME });
  });

  it('runs fetch-results on Node.js 24, arm64, 256 MB, with the bus name in its environment', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      Timeout: 30,
      MemorySize: 256,
      Environment: { Variables: { EVENT_BUS_NAME: { Ref: getLogicalId('AWS::Events::EventBus') } } },
      LoggingConfig: { LogGroup: { Ref: getLogicalId('AWS::Logs::LogGroup') } },
    });
  });

  it('keeps the logs of fetch-results for a limited time', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });

  it('gives fetch-results only its log writes and PutEvents on its bus', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    expect(Object.keys(policies)).toHaveLength(1);
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
            Effect: 'Allow',
            Resource: { 'Fn::GetAtt': [getLogicalId('AWS::Logs::LogGroup'), 'Arn'] },
          },
          {
            Action: 'events:PutEvents',
            Effect: 'Allow',
            Resource: { 'Fn::GetAtt': [getLogicalId('AWS::Events::EventBus'), 'Arn'] },
          },
        ],
      },
    });
  });

  it('attaches no managed policy to the fetch-results role', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [Match.objectLike({ Principal: { Service: 'lambda.amazonaws.com' } })],
      },
      ManagedPolicyArns: Match.absent(),
    });
  });
});
