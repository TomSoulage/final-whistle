import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { CLOUDFORMATION_EXECUTION_POLICY_NAME } from '../../infra/cloudformation-execution-policy.js';
import { FinalWhistleStack } from '../../infra/final-whistle-stack.js';
import { DEPLOY_ROLE_NAME, GithubOidcStack, PULL_REQUEST_ROLE_NAME } from '../../infra/github-oidc-stack.js';

const TEST_ACCOUNT = '123456789012';
const TEST_REGION = 'eu-north-1';
/** Synthesizing the app stack bundles every Lambda, which can exceed the default 10 s under load. */
const SYNTH_TIMEOUT_MS = 30_000;

interface Statement {
  readonly Action: string | readonly string[];
  readonly Resource: string | readonly string[];
}

interface ManagedPolicyProperties {
  readonly PolicyDocument: { readonly Statement: readonly Statement[] };
}

/** Project names, the bootstrap bucket and version parameter, and the log group lookup (`log-group:*`). */
const OWN_RESOURCE_PATTERN =
  /final-?whistle|cdk-hnb659fds-assets|cdk-bootstrap\/hnb659fds\/version|log-group:\*$/i;

let policyStatements: readonly Statement[];
let deployedResourceTypes: readonly string[];

function getPolicyStatements(): readonly Statement[] {
  const app = new App({ context: { '@aws-cdk/core:enablePartitionLiterals': true } });
  const env = { account: TEST_ACCOUNT, region: TEST_REGION };
  const template = Template.fromStack(new GithubOidcStack(app, 'TestGithubOidc', { env }));
  const policies: Readonly<Record<string, { readonly Properties?: ManagedPolicyProperties }>> =
    template.findResources('AWS::IAM::ManagedPolicy', {
      Properties: { ManagedPolicyName: CLOUDFORMATION_EXECUTION_POLICY_NAME },
    });
  const [policy, ...others] = Object.values(policies);
  const statements = policy?.Properties?.PolicyDocument.Statement;
  if (statements === undefined || others.length > 0) {
    throw new Error(`Expected exactly one managed policy named ${CLOUDFORMATION_EXECUTION_POLICY_NAME}`);
  }
  return statements;
}

function getDeployedResourceTypes(): readonly string[] {
  const template = Template.fromStack(new FinalWhistleStack(new App(), 'TestFinalWhistle'));
  const synthesized: { readonly Resources?: Readonly<Record<string, { readonly Type?: string }>> } = template.toJSON();
  return [...new Set(Object.values(synthesized.Resources ?? {}).map((resource) => resource.Type ?? ''))];
}

beforeAll(() => {
  policyStatements = getPolicyStatements();
  deployedResourceTypes = getDeployedResourceTypes();
}, SYNTH_TIMEOUT_MS);

const toList = (value: string | readonly string[]): readonly string[] => (typeof value === 'string' ? [value] : value);
const getActions = (): readonly string[] => policyStatements.flatMap((statement) => toList(statement.Action));
const getResources = (): readonly string[] => policyStatements.flatMap((statement) => toList(statement.Resource));

describe('CloudFormation execution policy', () => {
  it('covers every service the application stack deploys', () => {
    expect(deployedResourceTypes).toContain('AWS::Lambda::Function');
    // `AWS::Lambda::Function` is served by the `lambda` actions; the CDK metadata is not a real resource.
    const deployedServices = deployedResourceTypes
      .filter((type) => type !== 'AWS::CDK::Metadata')
      .map((type) => (type.split('::')[1] ?? '').toLowerCase());
    const allowedServices = new Set(getActions().map((action) => action.split(':')[0]));
    for (const service of new Set(deployedServices)) {
      expect(allowedServices, `service ${service}`).toContain(service);
    }
  });

  it('allows no `*` action and no resource outside the project', () => {
    expect(getActions()).not.toContain('*');
    expect(getResources()).not.toContain('*');
    for (const resource of getResources()) {
      expect(resource, resource).toMatch(OWN_RESOURCE_PATTERN);
    }
  });

  it('has the read actions that CloudFormation calls besides the usual ones', () => {
    // Found by deploying a probe stack with the restricted role; each of them was denied at least once.
    expect(getActions()).toEqual(
      expect.arrayContaining([
        'logs:DescribeLogGroups',
        'cloudwatch:DescribeAlarms',
        'iam:ListRolePolicies',
        'iam:ListAttachedRolePolicies',
      ]),
    );
  });

  it('limits IAM to the Lambda roles, which are named after the stack', () => {
    const iamStatements = policyStatements.filter((statement) =>
      toList(statement.Action).every((action) => action.startsWith('iam:')),
    );
    expect(iamStatements.flatMap((statement) => toList(statement.Resource))).toEqual([
      `arn:aws:iam::${TEST_ACCOUNT}:role/FinalWhistle-*`,
    ]);
  });

  it('cannot attach a managed policy, so a deployment cannot give a role administrator rights', () => {
    expect(getActions()).not.toContain('iam:AttachRolePolicy');
    expect(getActions()).not.toContain('iam:CreatePolicy');
  });

  it('cannot reach the GitHub roles nor itself', () => {
    const reachable = getResources().join(' ');
    expect(reachable).not.toContain(PULL_REQUEST_ROLE_NAME);
    expect(reachable).not.toContain(DEPLOY_ROLE_NAME);
    expect(reachable).not.toContain(CLOUDFORMATION_EXECUTION_POLICY_NAME);
  });
});
