import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { describe, expect, it, vi } from 'vitest';
import { isAlreadySent, rememberSent, type SendGetItem, type SendPutItem } from '../../src/notify/sent-matches.js';

const TABLE = 'sent-matches';
const MATCH_ID = '2026-11-01|Carcassonne|Lézignan';
const SENT_AT = new Date('2026-11-01T17:02:03.000Z');

describe('isAlreadySent', () => {
  it('reads the match id with a strongly consistent read', async () => {
    const send = vi.fn<SendGetItem>(() => Promise.resolve({ $metadata: {} }));

    await isAlreadySent(send, TABLE, MATCH_ID);

    expect(send.mock.calls[0]?.[0].input).toEqual({
      TableName: TABLE,
      Key: { matchId: { S: MATCH_ID } },
      ConsistentRead: true,
    });
  });

  it('is true when the match is in the table', async () => {
    const send = vi.fn<SendGetItem>(() => Promise.resolve({ $metadata: {}, Item: { matchId: { S: MATCH_ID } } }));
    await expect(isAlreadySent(send, TABLE, MATCH_ID)).resolves.toBe(true);
  });

  it('is false when it is not', async () => {
    const send = vi.fn<SendGetItem>(() => Promise.resolve({ $metadata: {} }));
    await expect(isAlreadySent(send, TABLE, MATCH_ID)).resolves.toBe(false);
  });

  it('fails naming the table and the match, keeping the AWS error as the cause', async () => {
    const awsError = new Error('Requested resource not found');
    const send = vi.fn<SendGetItem>(() => Promise.reject(awsError));

    await expect(isAlreadySent(send, TABLE, MATCH_ID)).rejects.toMatchObject({
      message: `Cannot check in ${TABLE} whether ${MATCH_ID} was already sent`,
      cause: awsError,
    });
  });
});

describe('rememberSent', () => {
  it('writes the match id and the send time, only if the match is not there yet', async () => {
    const send = vi.fn<SendPutItem>(() => Promise.resolve({ $metadata: {} }));

    await expect(rememberSent(send, TABLE, MATCH_ID, SENT_AT)).resolves.toBe('recorded');

    expect(send.mock.calls[0]?.[0].input).toEqual({
      TableName: TABLE,
      Item: { matchId: { S: MATCH_ID }, sentAt: { S: '2026-11-01T17:02:03.000Z' } },
      ConditionExpression: 'attribute_not_exists(#key)',
      ExpressionAttributeNames: { '#key': 'matchId' },
    });
  });

  it('reports a match recorded meanwhile instead of overwriting it', async () => {
    const send = vi.fn<SendPutItem>(() =>
      Promise.reject(new ConditionalCheckFailedException({ message: 'The conditional request failed', $metadata: {} })),
    );

    await expect(rememberSent(send, TABLE, MATCH_ID, SENT_AT)).resolves.toBe('already-recorded');
  });

  it('fails naming the table and the match on any other error', async () => {
    const awsError = new Error('Throughput exceeds the current capacity');
    const send = vi.fn<SendPutItem>(() => Promise.reject(awsError));

    await expect(rememberSent(send, TABLE, MATCH_ID, SENT_AT)).rejects.toMatchObject({
      message: `Cannot record ${MATCH_ID} as sent in ${TABLE}`,
      cause: awsError,
    });
  });
});
