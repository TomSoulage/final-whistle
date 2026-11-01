import { createLogger, type LogFields, type Logger } from '../src/shared/logger.js';

export type LogLine = Record<string, unknown>;

/** A `createLogger` for tests that keeps every line, parsed, so assertions can read the logs. */
export function captureLogs(): { readonly lines: LogLine[]; readonly createLogger: (context: LogFields) => Logger } {
  const lines: LogLine[] = [];
  return {
    lines,
    createLogger: (context) => createLogger(context, (line) => lines.push(JSON.parse(line) as LogLine)),
  };
}
