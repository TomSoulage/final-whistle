import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  DEPLOY_ROLE_NAME,
  GithubOidcStack,
  MAIN_BRANCH_SUBJECT,
  PULL_REQUEST_ROLE_NAME,
  PULL_REQUEST_SUBJECT,
} from '../../infra/github-oidc-stack.js';

const TEST_ACCOUNT = '123456789012';
const TEST_REGION = 'eu-north-1';

let template: Template;

beforeAll(() => {
  // As in cdk.json, so the partition renders as 'aws' and the role ARNs are plain strings.
  const app = new App({ context: { '@aws-cdk/core:enablePartitionLiterals': true } });
  const env = { account: TEST_ACCOUNT, region: TEST_REGION };
  template = Template.fromStack(new GithubOidcStack(app, 'TestGithubOidc', { env }));
});

function getBootstrapRoleArn(roleKind: string): string {
  return `arn:aws:iam::${TEST_ACCOUNT}:role/cdk-hnb659fds-${roleKind}-role-${TEST_ACCOUNT}-${TEST_REGION}`;
}

function getRoleLogicalId(roleName: string): string {
  const roles = template.findResources('AWS::IAM::Role', { Properties: { RoleName: roleName } });
  const [logicalId] = Object.keys(roles);
  if (logicalId === undefined) {
    throw new Error(`No IAM role named ${roleName} in the template`);
  }
  return logicalId;
}

function expectAssumableRoles(roleName: string, roleArns: string[]): void {
  // IAM writes a single resource as a string and several as a list.
  const resource = roleArns.length === 1 ? roleArns[0] : roleArns;
  template.hasResourceProperties('AWS::IAM::Policy', {
    Roles: [{ Ref: getRoleLogicalId(roleName) }],
    PolicyDocument: {
      Statement: [{ Effect: 'Allow', Action: 'sts:AssumeRole', Resource: resource }],
    },
  });
}

function expectTrustedSubject(roleName: string, subject: string): void {
  template.hasResourceProperties('AWS::IAM::Role', {
    RoleName: roleName,
    AssumeRolePolicyDocument: {
      Statement: [
        Match.objectLike({
          Action: 'sts:AssumeRoleWithWebIdentity',
          Condition: {
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              'token.actions.githubusercontent.com:sub': subject,
            },
          },
        }),
      ],
    },
  });
}

describe('GithubOidcStack', () => {
  it('trusts the GitHub Actions token issuer for the STS audience', () => {
    template.hasResourceProperties('AWS::IAM::OIDCProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIdList: ['sts.amazonaws.com'],
    });
  });

  it('lets only pull requests of this repository assume the pull request role', () => {
    expect(PULL_REQUEST_SUBJECT).toBe('repo:TomSoulage@76871522/final-whistle@1440617490:pull_request');
    expectTrustedSubject(PULL_REQUEST_ROLE_NAME, PULL_REQUEST_SUBJECT);
  });

  it('lets only the main branch of this repository assume the deploy role', () => {
    expect(MAIN_BRANCH_SUBJECT).toBe('repo:TomSoulage@76871522/final-whistle@1440617490:ref:refs/heads/main');
    expectTrustedSubject(DEPLOY_ROLE_NAME, MAIN_BRANCH_SUBJECT);
  });

  it('limits the pull request role to the read-only CDK lookup role', () => {
    expectAssumableRoles(PULL_REQUEST_ROLE_NAME, [getBootstrapRoleArn('lookup')]);
  });

  it('lets the deploy role assume only the CDK lookup, deploy and file publishing roles', () => {
    expectAssumableRoles(DEPLOY_ROLE_NAME, [
      getBootstrapRoleArn('lookup'),
      getBootstrapRoleArn('deploy'),
      getBootstrapRoleArn('file-publishing'),
    ]);
  });

  it('has no other IAM policy than the two roles above', () => {
    template.resourceCountIs('AWS::IAM::Policy', 2);
  });
});
