import {
  ConditionalCheckFailedException,
  GetItemCommand,
  type GetItemCommandOutput,
  PutItemCommand,
  type PutItemCommandOutput,
} from '@aws-sdk/client-dynamodb';

/** Partition key of the sent-matches table, shared with the stack that creates it. */
export const SENT_MATCHES_KEY = 'matchId';

export type SendGetItem = (command: GetItemCommand) => Promise<GetItemCommandOutput>;
export type SendPutItem = (command: PutItemCommand) => Promise<PutItemCommandOutput>;

/** `already-recorded`: another invocation sent and recorded the same score meanwhile. */
export type RememberOutcome = 'recorded' | 'already-recorded';

/** Strongly consistent, so a score recorded a moment ago is always seen. */
export async function isAlreadySent(sendGetItem: SendGetItem, tableName: string, matchId: string): Promise<boolean> {
  const command = new GetItemCommand({
    TableName: tableName,
    Key: { [SENT_MATCHES_KEY]: { S: matchId } },
    ConsistentRead: true,
  });
  try {
    const output = await sendGetItem(command);
    return output.Item !== undefined;
  } catch (error) {
    throw new Error(`Cannot check in ${tableName} whether ${matchId} was already sent`, { cause: error });
  }
}

/** Records a sent score; the write is conditional, so a concurrent duplicate is detected instead of overwritten. */
export async function rememberSent(
  sendPutItem: SendPutItem,
  tableName: string,
  matchId: string,
  sentAt: Date,
): Promise<RememberOutcome> {
  const command = new PutItemCommand({
    TableName: tableName,
    Item: { [SENT_MATCHES_KEY]: { S: matchId }, sentAt: { S: sentAt.toISOString() } },
    ConditionExpression: 'attribute_not_exists(#key)',
    ExpressionAttributeNames: { '#key': SENT_MATCHES_KEY },
  });
  try {
    await sendPutItem(command);
    return 'recorded';
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      return 'already-recorded';
    }
    throw new Error(`Cannot record ${matchId} as sent in ${tableName}`, { cause: error });
  }
}
