import { Duration, Validations } from 'aws-cdk-lib';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

/** The longest SQS allows: a failure can wait a few days before it is looked at. */
const RETENTION_DAYS = 14;

/**
 * The dead-letter queue of the pipeline (D9, D37): what a Lambda still fails after its retries, and what
 * a schedule or the bus rule cannot deliver to its Lambda, lands here instead of being dropped.
 */
export function createFailureQueue(scope: Construct): Queue {
  const queue = new Queue(scope, 'FailureQueue', {
    retentionPeriod: Duration.days(RETENTION_DAYS),
    encryption: QueueEncryption.SQS_MANAGED,
    enforceSSL: true,
  });
  Validations.of(queue).acknowledge({
    id: 'AwsSolutions::AwsSolutions-SQS3',
    reason: 'This queue is the dead-letter queue of the pipeline; it is watched by an alarm, not drained by a consumer.',
  });
  return queue;
}
