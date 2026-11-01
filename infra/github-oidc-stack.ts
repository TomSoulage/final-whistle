import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { OidcProviderNative, OpenIdConnectPrincipal, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com';
const GITHUB_OIDC_AUDIENCE = 'sts.amazonaws.com';
// GitHub's immutable subject format: owner and repository names carry their numeric ids,
// so a repository recreated under the same name cannot match.
const GITHUB_REPOSITORY = 'TomSoulage@76871522/final-whistle@1440617490';
const CDK_BOOTSTRAP_QUALIFIER = 'hnb659fds';

export const PULL_REQUEST_SUBJECT = `repo:${GITHUB_REPOSITORY}:pull_request`;
// A job bound to a GitHub environment gets this subject instead of its branch: the environment's
// branch policy (main only) is what keeps other branches out.
export const PRODUCTION_ENVIRONMENT_SUBJECT = `repo:${GITHUB_REPOSITORY}:environment:production`;
export const PULL_REQUEST_ROLE_NAME = 'final-whistle-github-pull-request';
export const DEPLOY_ROLE_NAME = 'final-whistle-github-deploy';

type CdkBootstrapRoleKind = 'lookup' | 'deploy' | 'file-publishing';

interface GithubRoleProps {
  readonly roleName: string;
  readonly subject: string;
  readonly bootstrapRoles: readonly CdkBootstrapRoleKind[];
  readonly description: string;
}

/** ARN of a role created by `cdk bootstrap` in the stack's account and region. */
function getCdkBootstrapRoleArn(stack: Stack, roleKind: CdkBootstrapRoleKind): string {
  return `arn:${stack.partition}:iam::${stack.account}:role/cdk-${CDK_BOOTSTRAP_QUALIFIER}-${roleKind}-role-${stack.account}-${stack.region}`;
}

/**
 * GitHub OIDC trust for this repository: the provider, a read-only role for pull requests
 * (`cdk diff`) and a deploy role usable from the `production` environment only. Deployed by
 * hand: CI cannot create the role it signs in with.
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
      subject: PRODUCTION_ENVIRONMENT_SUBJECT,
      bootstrapRoles: ['lookup', 'deploy', 'file-publishing'],
      description: 'GitHub Actions in the production environment: cdk deploy',
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
        resources: props.bootstrapRoles.map((roleKind) => getCdkBootstrapRoleArn(this, roleKind)),
      }),
    );
    new CfnOutput(this, `${id}Arn`, { value: role.roleArn });
  }
}
