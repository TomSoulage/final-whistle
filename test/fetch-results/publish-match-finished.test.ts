import type { PutEventsCommandOutput } from '@aws-sdk/client-eventbridge';
import { describe, expect, it, vi } from 'vitest';
import {
  publishMatchFinished,
  type SendPutEvents,
} from '../../src/fetch-results/publish-match-finished.js';

const RESULT = {
  date: '2026-11-01',
  homeTeam: 'Carcassonne',
  awayTeam: 'Lézignan',
  competition: 'SUPER XIII',
  homeScore: 22,
  awayScore: 18,
};

function stubSend(output: Partial<PutEventsCommandOutput>) {
  return vi.fn<SendPutEvents>(() => Promise.resolve({ $metadata: {}, ...output }));
}

describe('publishMatchFinished', () => {
  it('sends one MatchFinished entry to the bus', async () => {
    const send = stubSend({ FailedEntryCount: 0, Entries: [{ EventId: 'e1' }] });

    await publishMatchFinished(send, 'final-whistle', RESULT);

    const [command] = send.mock.calls[0] ?? [];
    expect(command?.input.Entries).toHaveLength(1);
    expect(command?.input.Entries?.[0]).toMatchObject({
      EventBusName: 'final-whistle',
      DetailType: 'MatchFinished',
    });
  });

  it('fails, naming the match and the AWS error, when the entry is rejected', async () => {
    const send = stubSend({
      FailedEntryCount: 1,
      Entries: [{ ErrorCode: 'InternalFailure', ErrorMessage: 'try again' }],
    });

    await expect(publishMatchFinished(send, 'final-whistle', RESULT)).rejects.toThrow(
      'MatchFinished for 2026-11-01|Carcassonne|Lézignan rejected by EventBridge: InternalFailure try again',
    );
  });

  it('fails even when a rejection comes without details', async () => {
    const send = stubSend({ FailedEntryCount: 1 });

    await expect(publishMatchFinished(send, 'final-whistle', RESULT)).rejects.toThrow(
      'rejected by EventBridge: unknown error',
    );
  });

  it('lets a request failure through, so the invocation is retried', async () => {
    const send = vi.fn<SendPutEvents>(() => Promise.reject(new Error('socket hang up')));

    await expect(publishMatchFinished(send, 'final-whistle', RESULT)).rejects.toThrow('socket hang up');
  });
});
