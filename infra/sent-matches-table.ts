import { RemovalPolicy, Validations } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';
import { SENT_MATCHES_KEY } from '../src/notify/sent-matches.js';

// The Always Free quota covers provisioned capacity, not on-demand; the load is a few writes per match day (D10).
const READ_CAPACITY_UNITS = 1;
const WRITE_CAPACITY_UNITS = 1;

/** The scores already sent, keyed by match id (D8). Kept, and protected, if the stack or a change tries to remove it. */
export function createSentMatchesTable(scope: Construct): Table {
  const table = new Table(scope, 'SentMatches', {
    partitionKey: { name: SENT_MATCHES_KEY, type: AttributeType.STRING },
    billingMode: BillingMode.PROVISIONED,
    readCapacity: READ_CAPACITY_UNITS,
    writeCapacity: WRITE_CAPACITY_UNITS,
    removalPolicy: RemovalPolicy.RETAIN,
    deletionProtection: true,
  });
  Validations.of(table).acknowledge({
    id: 'AwsSolutions-DDB3',
    reason:
      'The table only prevents duplicate messages: losing it costs at worst one score sent twice, never a lost ' +
      'score. Point-in-time recovery is billed (D17); deletion protection and RETAIN guard against losing it.',
  });
  return table;
}
