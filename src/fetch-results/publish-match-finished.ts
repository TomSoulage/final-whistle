import { PutEventsCommand, type PutEventsCommandOutput } from '@aws-sdk/client-eventbridge';
import { buildMatchFinishedEntry } from '../events/match-finished.js';
import { buildMatchId, type MatchResult } from '../results/match-result.js';

export type SendPutEvents = (command: PutEventsCommand) => Promise<PutEventsCommandOutput>;

/**
 * Publishes `MatchFinished`. PutEvents does not throw when an entry is rejected, it only
 * reports it in the response: a rejected entry is turned into an error, so no score is lost silently.
 */
export async function publishMatchFinished(
  sendPutEvents: SendPutEvents,
  eventBusName: string,
  result: MatchResult,
): Promise<void> {
  const command = new PutEventsCommand({ Entries: [buildMatchFinishedEntry(eventBusName, result)] });
  const output = await sendPutEvents(command);
  if ((output.FailedEntryCount ?? 0) === 0) {
    return;
  }
  const [failedEntry] = output.Entries ?? [];
  throw new Error(
    `MatchFinished for ${buildMatchId(result)} rejected by EventBridge: ` +
      `${failedEntry?.ErrorCode ?? 'unknown error'} ${failedEntry?.ErrorMessage ?? ''}`.trim(),
  );
}
