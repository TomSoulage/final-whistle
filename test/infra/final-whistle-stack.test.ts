import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { EVENT_BUS_NAME, FinalWhistleStack } from '../../infra/final-whistle-stack.js';

let template: Template;

/** Synthesizing the stack bundles every Lambda, which can exceed the default 10 s under load. */
const SYNTH_TIMEOUT_MS = 30_000;

beforeAll(() => {
  template = Template.fromStack(new FinalWhistleStack(new App(), 'TestFinalWhistle'));
}, SYNTH_TIMEOUT_MS);

/** The logical id of the only resource of this type under a construct, e.g. `Notify`. */
function getLogicalId(type: string, constructId = ''): string {
  const [logicalId, ...others] = Object.keys(template.findResources(type)).filter((id) => id.startsWith(constructId));
  if (logicalId === undefined || others.length > 0) {
    throw new Error(`Expected exactly one ${type} under "${constructId}" in the template`);
  }
  return logicalId;
}

type Properties = Readonly<Record<string, unknown>>;

/** The properties of the only resource of this type under a construct. */
function getProperties(type: string, constructId = ''): Properties {
  const resources: Readonly<Record<string, { readonly Properties?: Properties }>> = template.findResources(type);
  return resources[getLogicalId(type, constructId)]?.Properties ?? {};
}

/** The exact list of statements of a role's policy: no permission can be added unnoticed. */
function expectPolicyStatements(constructId: string, statements: readonly unknown[]): void {
  expect(getProperties('AWS::IAM::Policy', constructId)).toMatchObject({ PolicyDocument: { Statement: statements } });
}

const LOG_WRITE_STATEMENT = (constructId: string) => ({
  Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
  Effect: 'Allow',
  Resource: { 'Fn::GetAtt': [getLogicalId('AWS::Logs::LogGroup', constructId), 'Arn'] },
});

/** Create schedules in the match check group only, and pass their role to Scheduler only. */
const SCHEDULE_CHECK_STATEMENTS = () => [
  {
    Action: 'scheduler:CreateSchedule',
    Effect: 'Allow',
    Resource: {
      'Fn::Join': [
        '',
        ['arn:', { Ref: 'AWS::Partition' }, ':scheduler:', { Ref: 'AWS::Region' }, ':', { Ref: 'AWS::AccountId' }, ':schedule/final-whistle-match-checks/*'],
      ],
    },
  },
  {
    Action: 'iam:PassRole',
    Condition: { StringEquals: { 'iam:PassedToService': 'scheduler.amazonaws.com' } },
    Effect: 'Allow',
    Resource: { 'Fn::GetAtt': [getLogicalId('AWS::IAM::Role', 'MatchChecks'), 'Arn'] },
  },
];

const LAMBDA_TRUST = { Statement: [Match.objectLike({ Principal: { Service: 'lambda.amazonaws.com' } })] };

/** Only schedules of this account may use a Scheduler role (confused deputy). */
const SCHEDULER_TRUST = {
  Statement: [
    {
      Action: 'sts:AssumeRole',
      Condition: { StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } } },
      Effect: 'Allow',
      Principal: { Service: 'scheduler.amazonaws.com' },
    },
  ],
};

function getParameterArn(name: string): unknown {
  return {
    'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':ssm:', { Ref: 'AWS::Region' }, ':', { Ref: 'AWS::AccountId' }, `:parameter${name}`]],
  };
}

describe('FinalWhistleStack', () => {
  it('creates the event bus that MatchFinished is published on', () => {
    template.resourceCountIs('AWS::Events::EventBus', 1);
    template.hasResourceProperties('AWS::Events::EventBus', { Name: EVENT_BUS_NAME });
  });

  it('keeps the logs of each Lambda in its own log group, for a limited time', () => {
    template.resourceCountIs('AWS::Logs::LogGroup', 3);
    template.allResourcesProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });

  it('gives each Lambda and each kind of schedule its own role, with no managed policy', () => {
    template.resourceCountIs('AWS::IAM::Role', 5);
    template.allResourcesProperties('AWS::IAM::Role', { ManagedPolicyArns: Match.absent() });
    template.resourcePropertiesCountIs('AWS::IAM::Role', { AssumeRolePolicyDocument: LAMBDA_TRUST }, 3);
    template.resourcePropertiesCountIs('AWS::IAM::Role', { AssumeRolePolicyDocument: SCHEDULER_TRUST }, 2);
  });
});

describe('fetch-results', () => {
  it('runs on Node.js 24, arm64, 256 MB, with the bus and where to schedule its next attempt in its environment', () => {
    expect(getProperties('AWS::Lambda::Function', 'FetchResults')).toMatchObject({
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      Timeout: 30,
      MemorySize: 256,
      Environment: {
        Variables: {
          EVENT_BUS_NAME: { Ref: getLogicalId('AWS::Events::EventBus') },
          MATCH_CHECK_SCHEDULE_GROUP: 'final-whistle-match-checks',
          MATCH_CHECK_ROLE_ARN: { 'Fn::GetAtt': [getLogicalId('AWS::IAM::Role', 'MatchChecks'), 'Arn'] },
        },
      },
      LoggingConfig: { LogGroup: { Ref: getLogicalId('AWS::Logs::LogGroup', 'FetchResults') } },
    });
  });

  it('may only write its logs, publish on its bus, and schedule its next attempt', () => {
    expectPolicyStatements('FetchResults', [
      LOG_WRITE_STATEMENT('FetchResults'),
      {
        Action: 'events:PutEvents',
        Effect: 'Allow',
        Resource: { 'Fn::GetAtt': [getLogicalId('AWS::Events::EventBus'), 'Arn'] },
      },
      ...SCHEDULE_CHECK_STATEMENTS(),
    ]);
  });
});

describe('notify', () => {
  it('runs on Node.js 24, arm64, 256 MB, with the names of its table and parameters, never their values', () => {
    expect(getProperties('AWS::Lambda::Function', 'Notify')).toMatchObject({
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      Timeout: 20,
      MemorySize: 256,
      Environment: {
        Variables: {
          SENT_MATCHES_TABLE_NAME: { Ref: getLogicalId('AWS::DynamoDB::Table') },
          BOT_TOKEN_PARAMETER_NAME: '/final-whistle/telegram/bot-token',
          CHAT_ID_PARAMETER_NAME: '/final-whistle/telegram/chat-id',
        },
      },
      LoggingConfig: { LogGroup: { Ref: getLogicalId('AWS::Logs::LogGroup', 'Notify') } },
    });
  });

  it('may only write its logs, read and write one item of its table, and read the two Telegram parameters', () => {
    expectPolicyStatements('Notify', [
      LOG_WRITE_STATEMENT('Notify'),
      {
        Action: ['dynamodb:GetItem', 'dynamodb:PutItem'],
        Effect: 'Allow',
        Resource: { 'Fn::GetAtt': [getLogicalId('AWS::DynamoDB::Table'), 'Arn'] },
      },
      {
        Action: 'ssm:GetParameters',
        Effect: 'Allow',
        Resource: [getParameterArn('/final-whistle/telegram/bot-token'), getParameterArn('/final-whistle/telegram/chat-id')],
      },
    ]);
  });

  it('is invoked by a rule matching MatchFinished from fetch-results on the bus', () => {
    template.resourceCountIs('AWS::Events::Rule', 1);
    template.hasResourceProperties('AWS::Events::Rule', {
      EventBusName: { Ref: getLogicalId('AWS::Events::EventBus') },
      EventPattern: { source: ['final-whistle.fetch-results'], 'detail-type': ['MatchFinished'] },
      Targets: [Match.objectLike({ Arn: { 'Fn::GetAtt': [getLogicalId('AWS::Lambda::Function', 'Notify'), 'Arn'] } })],
    });
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 'events.amazonaws.com',
      SourceArn: { 'Fn::GetAtt': [getLogicalId('AWS::Events::Rule'), 'Arn'] },
    });
  });
});

describe('sent-matches table', () => {
  it('is keyed by match id, with the provisioned capacity of the Always Free quota', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [{ AttributeName: 'matchId', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'matchId', AttributeType: 'S' }],
      ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
    });
  });

  it('is kept if the stack is deleted, and protected against deletion', () => {
    template.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: Match.objectLike({ DeletionProtectionEnabled: true }),
    });
  });
});

describe('match checks', () => {
  it('have their own schedule group', () => {
    template.resourceCountIs('AWS::Scheduler::ScheduleGroup', 1);
    template.hasResourceProperties('AWS::Scheduler::ScheduleGroup', { Name: 'final-whistle-match-checks' });
  });

  it('invoke fetch-results with a role that can do nothing else', () => {
    expect(getProperties('AWS::IAM::Role', 'MatchChecks')).toMatchObject({ AssumeRolePolicyDocument: SCHEDULER_TRUST });
    expectPolicyStatements('MatchChecks', [
      {
        Action: 'lambda:InvokeFunction',
        Effect: 'Allow',
        Resource: { 'Fn::GetAtt': [getLogicalId('AWS::Lambda::Function', 'FetchResults'), 'Arn'] },
      },
    ]);
  });
});

describe('planner', () => {
  it('runs on Node.js 24, arm64, 256 MB, with where to send match checks in its environment', () => {
    expect(getProperties('AWS::Lambda::Function', 'Planner')).toMatchObject({
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      Timeout: 30,
      MemorySize: 256,
      Environment: {
        Variables: {
          MATCH_CHECK_SCHEDULE_GROUP: 'final-whistle-match-checks',
          MATCH_CHECK_FUNCTION_ARN: { 'Fn::GetAtt': [getLogicalId('AWS::Lambda::Function', 'FetchResults'), 'Arn'] },
          MATCH_CHECK_ROLE_ARN: { 'Fn::GetAtt': [getLogicalId('AWS::IAM::Role', 'MatchChecks'), 'Arn'] },
        },
      },
      LoggingConfig: { LogGroup: { Ref: getLogicalId('AWS::Logs::LogGroup', 'Planner') } },
    });
  });

  it('may only write its logs, create schedules in the match check group, and pass their role to Scheduler', () => {
    expectPolicyStatements('PlannerRoleDefaultPolicy', [LOG_WRITE_STATEMENT('Planner'), ...SCHEDULE_CHECK_STATEMENTS()]);
  });

  it('runs every day at 10:00 Paris time, from a schedule outside the match check group', () => {
    template.resourceCountIs('AWS::Scheduler::Schedule', 1);
    template.hasResourceProperties('AWS::Scheduler::Schedule', {
      ScheduleExpression: 'cron(0 10 * * ? *)',
      ScheduleExpressionTimezone: 'Europe/Paris',
      GroupName: Match.absent(),
      Target: Match.objectLike({
        Arn: { 'Fn::GetAtt': [getLogicalId('AWS::Lambda::Function', 'Planner'), 'Arn'] },
        RoleArn: { 'Fn::GetAtt': [getLogicalId('AWS::IAM::Role', 'PlannerMorningScheduleRole'), 'Arn'] },
      }),
    });
  });

  it('is run by a role that may only invoke the planner', () => {
    expect(getProperties('AWS::IAM::Role', 'PlannerMorningScheduleRole')).toMatchObject({
      AssumeRolePolicyDocument: SCHEDULER_TRUST,
    });
    const plannerArn = { 'Fn::GetAtt': [getLogicalId('AWS::Lambda::Function', 'Planner'), 'Arn'] };
    expectPolicyStatements('PlannerMorningScheduleRole', [
      { Action: 'lambda:InvokeFunction', Effect: 'Allow', Resource: [plannerArn, { 'Fn::Join': ['', [plannerArn, ':*']] }] },
    ]);
  });
});
