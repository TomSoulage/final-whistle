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

let template: Template;

beforeAll(() => {
  template = Template.fromStack(new GithubOidcStack(new App(), 'TestGithubOidc'));
});

function getRoleLogicalId(roleName: string): string {
  const roles = template.findResources('AWS::IAM::Role', { Properties: { RoleName: roleName } });
  const [logicalId] = Object.keys(roles);
  if (logicalId === undefined) {
    throw new Error(`No IAM role named ${roleName} in the template`);
  }
  return logicalId;
}

function getAssumableResources(roleName: string): string {
  const policies = template.findResources('AWS::IAM::Policy', {
    Properties: { Roles: [{ Ref: getRoleLogicalId(roleName) }] },
  });
  return JSON.stringify(Object.values(policies));
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
    const resources = getAssumableResources(PULL_REQUEST_ROLE_NAME);
    expect(resources).toContain('-lookup-role-');
    expect(resources).not.toContain('-deploy-role-');
    expect(resources).not.toContain('-file-publishing-role-');
  });

  it('lets the deploy role assume the CDK lookup, deploy and file publishing roles', () => {
    const resources = getAssumableResources(DEPLOY_ROLE_NAME);
    expect(resources).toContain('-lookup-role-');
    expect(resources).toContain('-deploy-role-');
    expect(resources).toContain('-file-publishing-role-');
  });

  it('grants only sts:AssumeRole, never a wildcard', () => {
    const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));
    expect(policies).not.toContain('"*"');
    template.allResourcesProperties('AWS::IAM::Policy', {
      PolicyDocument: { Statement: [Match.objectLike({ Action: 'sts:AssumeRole' })] },
    });
  });
});
