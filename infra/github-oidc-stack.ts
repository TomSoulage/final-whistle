import { Aws, CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { OidcProviderNative, OpenIdConnectPrincipal, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com';
const GITHUB_OIDC_AUDIENCE = 'sts.amazonaws.com';
const GITHUB_REPOSITORY = 'TomSoulage/final-whistle';
const CDK_BOOTSTRAP_QUALIFIER = 'hnb659fds';

export const PULL_REQUEST_SUBJECT = `repo:${GITHUB_REPOSITORY}:pull_request`;
export const MAIN_BRANCH_SUBJECT = `repo:${GITHUB_REPOSITORY}:ref:refs/heads/main`;
export const PULL_REQUEST_ROLE_NAME = 'final-whistle-github-pull-request';
export const DEPLOY_ROLE_NAME = 'final-whistle-github-deploy';

type CdkBootstrapRoleKind = 'lookup' | 'deploy' | 'file-publishing';

interface GithubRoleProps {
  readonly roleName: string;
  readonly subject: string;
  readonly bootstrapRoles: readonly CdkBootstrapRoleKind[];
  readonly description: string;
}

/** ARN of a role created by `cdk bootstrap` in this stack's account and region. */
function getCdkBootstrapRoleArn(roleKind: CdkBootstrapRoleKind): string {
  return `arn:${Aws.PARTITION}:iam::${Aws.ACCOUNT_ID}:role/cdk-${CDK_BOOTSTRAP_QUALIFIER}-${roleKind}-role-${Aws.ACCOUNT_ID}-${Aws.REGION}`;
}

/**
 * GitHub OIDC trust for this repository: the provider, a read-only role for pull requests
 * (`cdk diff`) and a deploy role usable from `main` only. Deployed once by hand: CI cannot
 * create the role it signs in with.
 */
export class GithubOidcStack extends Stack {
  private readonly provider: OidcProviderNative;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.provider = new OidcProviderNative(this, 'GithubProvider', {
      url: `https://${GITHUB_OIDC_HOST}`,
      clientIds: [GITHUB_OIDC_AUDIENCE],
    });
    this.createGithubRole('PullRequestRole', {
      roleName: PULL_REQUEST_ROLE_NAME,
      subject: PULL_REQUEST_SUBJECT,
      bootstrapRoles: ['lookup'],
      description: 'GitHub Actions on pull requests: read-only cdk diff',
    });
    this.createGithubRole('DeployRole', {
      roleName: DEPLOY_ROLE_NAME,
      subject: MAIN_BRANCH_SUBJECT,
      bootstrapRoles: ['lookup', 'deploy', 'file-publishing'],
      description: 'GitHub Actions on main: cdk deploy',
    });
  }

  /** A role that only a GitHub token with this exact subject can assume. */
  private createGithubRole(id: string, props: GithubRoleProps): void {
    const role = new Role(this, id, {
      roleName: props.roleName,
      description: props.description,
      assumedBy: new OpenIdConnectPrincipal(this.provider, {
        StringEquals: {
          [`${GITHUB_OIDC_HOST}:aud`]: GITHUB_OIDC_AUDIENCE,
          [`${GITHUB_OIDC_HOST}:sub`]: props.subject,
        },
      }),
    });
    role.addToPolicy(
      new PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: props.bootstrapRoles.map(getCdkBootstrapRoleArn),
      }),
    );
    new CfnOutput(this, `${id}Arn`, { value: role.roleArn });
  }
}
