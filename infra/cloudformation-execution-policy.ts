import { Stack, Validations } from 'aws-cdk-lib';
import { ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export const CLOUDFORMATION_EXECUTION_POLICY_NAME = 'final-whistle-cfn-execution';

// CDK names most resources after the stack (`FinalWhistle-…`); a few have a fixed lowercase name.
const GENERATED_NAME_PREFIX = 'FinalWhistle-';
const FIXED_NAME_PREFIX = 'final-whistle';

const IAM_ROLE_ACTIONS = [
  'iam:CreateRole',
  'iam:DeleteRole',
  'iam:GetRole',
  'iam:PassRole',
  'iam:UpdateRole',
  'iam:UpdateAssumeRolePolicy',
  'iam:PutRolePolicy',
  'iam:GetRolePolicy',
  'iam:DeleteRolePolicy',
  'iam:TagRole',
  'iam:UntagRole',
  'iam:UpdateRoleDescription',
  'iam:ListRolePolicies',
  'iam:ListAttachedRolePolicies',
];

const CLOUDWATCH_ALARM_ACTIONS = [
  'cloudwatch:PutMetricAlarm',
  'cloudwatch:DeleteAlarms',
  'cloudwatch:DescribeAlarms',
  'cloudwatch:ListTagsForResource',
  'cloudwatch:TagResource',
  'cloudwatch:UntagResource',
];

interface ArnParts {
  readonly partition: string;
  readonly region: string;
  readonly account: string;
}

interface Grant {
  readonly actions: readonly string[];
  /** Builds the resources it covers, in the account and region given. */
  readonly getResources: (parts: ArnParts) => readonly string[];
}

const arn = (parts: ArnParts, service: string, resource: string): string =>
  `arn:${parts.partition}:${service}:${parts.region}:${parts.account}:${resource}`;

function getServiceGrants(): readonly Grant[] {
  return [
    { actions: ['lambda:*'], getResources: (p) => [arn(p, 'lambda', `function:${GENERATED_NAME_PREFIX}*`)] },
    { actions: ['dynamodb:*'], getResources: (p) => [arn(p, 'dynamodb', `table/${GENERATED_NAME_PREFIX}*`)] },
    {
      actions: ['logs:*'],
      getResources: (p) => [
        arn(p, 'logs', `log-group:${GENERATED_NAME_PREFIX}*`),
        arn(p, 'logs', `log-group:${GENERATED_NAME_PREFIX}*:*`),
      ],
    },
    { actions: ['sqs:*'], getResources: (p) => [arn(p, 'sqs', `${GENERATED_NAME_PREFIX}*`)] },
    { actions: ['sns:*'], getResources: (p) => [arn(p, 'sns', `${FIXED_NAME_PREFIX}-*`)] },
    {
      actions: ['events:*'],
      getResources: (p) => [
        arn(p, 'events', `event-bus/${FIXED_NAME_PREFIX}`),
        arn(p, 'events', `rule/${FIXED_NAME_PREFIX}/*`),
      ],
    },
    {
      actions: ['scheduler:*'],
      getResources: (p) => [
        arn(p, 'scheduler', `schedule-group/${FIXED_NAME_PREFIX}-*`),
        arn(p, 'scheduler', `schedule/${FIXED_NAME_PREFIX}-*/*`),
      ],
    },
  ];
}

function getAlarmIamAndAssetGrants(bootstrapQualifier: string): readonly Grant[] {
  return [
    { actions: CLOUDWATCH_ALARM_ACTIONS, getResources: (p) => [arn(p, 'cloudwatch', `alarm:${FIXED_NAME_PREFIX}-*`)] },
    {
      actions: IAM_ROLE_ACTIONS,
      getResources: (p) => [`arn:${p.partition}:iam::${p.account}:role/${GENERATED_NAME_PREFIX}*`],
    },
    // CloudFormation reads the Lambda code from the bootstrap bucket with this role.
    {
      actions: ['s3:GetObject'],
      getResources: (p) => [`arn:${p.partition}:s3:::cdk-${bootstrapQualifier}-assets-${p.account}-${p.region}/*`],
    },
  ];
}

/**
 * CloudFormation looks a log group up before using its ARN. IAM does not match that request against the
 * group's own ARN, so this read-only action needs `log-group:*` (it also matches `log-group::log-stream:`).
 */
const getLogGroupLookupGrant = (): Grant => ({
  actions: ['logs:DescribeLogGroups'],
  getResources: (p) => [arn(p, 'logs', 'log-group:*')],
});

/** Every stack checks the bootstrap version, which CloudFormation reads with this role. */
const getBootstrapVersionGrant = (bootstrapQualifier: string): Grant => ({
  actions: ['ssm:GetParameters'],
  getResources: (p) => [arn(p, 'ssm', `parameter/cdk-bootstrap/${bootstrapQualifier}/version`)],
});

const getGrants = (bootstrapQualifier: string): readonly Grant[] => [
  ...getServiceGrants(),
  ...getAlarmIamAndAssetGrants(bootstrapQualifier),
  getBootstrapVersionGrant(bootstrapQualifier),
  getLogGroupLookupGrant(),
];

/** How cdk-nag writes the account, region and partition of a template in its findings. */
const NAG_PLACEHOLDERS: ArnParts = {
  partition: '<AWS::Partition>',
  region: '<AWS::Region>',
  account: '<AWS::AccountId>',
};

/**
 * What CloudFormation may do when it deploys the `FinalWhistle` stack: create, change and delete the
 * services the stack uses, on resources named after the project, and nothing else. It replaces the
 * `AdministratorAccess` that `cdk bootstrap` attaches to its execution role by default (D40).
 *
 * IAM is limited to the roles named after the stack: no managed policy can be attached, and the GitHub
 * roles and this policy are out of reach. A reviewed template can still create such a role with any
 * inline policy, so the pull request review stays the last guard (D40).
 */
export function createCloudFormationExecutionPolicy(scope: Construct, bootstrapQualifier: string): ManagedPolicy {
  const stack = Stack.of(scope);
  const grants = getGrants(bootstrapQualifier);
  const policy = new ManagedPolicy(scope, 'CloudFormationExecutionPolicy', {
    managedPolicyName: CLOUDFORMATION_EXECUTION_POLICY_NAME,
    description: 'CloudFormation execution role of cdk bootstrap: only what the FinalWhistle stack deploys',
    statements: grants.map(
      (grant) => new PolicyStatement({ actions: [...grant.actions], resources: [...grant.getResources(stack)] }),
    ),
  });
  acknowledgeWildcards(policy, grants);
  return policy;
}

/** One cdk-nag acknowledgement per wildcard: each one only completes a project name or covers a service. */
function acknowledgeWildcards(policy: ManagedPolicy, grants: readonly Grant[]): void {
  const reason =
    'Wildcards only complete the names CDK generates (`FinalWhistle-*`) or the fixed `final-whistle*` names, ' +
    'or cover the actions of a service the stack uses: nothing outside the project is reachable (D40).';
  const findings = grants.flatMap((grant) => [
    ...grant.actions.filter((action) => action.endsWith('*')).map((action) => `Action::${action}`),
    ...grant
      .getResources(NAG_PLACEHOLDERS)
      .filter((resource) => resource.includes('*'))
      .map((resource) => `Resource::${resource}`),
  ]);
  for (const finding of findings) {
    Validations.of(policy).acknowledge({ id: `AwsSolutions::AwsSolutions-IAM5[${finding}]`, reason });
  }
}
