export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  readonly info: (message: string, fields?: LogFields) => void;
  readonly warn: (message: string, fields?: LogFields) => void;
  readonly error: (message: string, fields?: LogFields) => void;
}

type LogLevel = 'INFO' | 'WARN' | 'ERROR';
type WriteLine = (line: string) => void;

const writeToStdout: WriteLine = (line) => {
  process.stdout.write(`${line}\n`);
};

/**
 * Structured JSON logs, one object per line. The context (e.g. the match id) is on every line,
 * and neither it nor the level and message can be overwritten by the fields of one line.
 */
export function createLogger(context: LogFields, writeLine: WriteLine = writeToStdout): Logger {
  const logAt =
    (level: LogLevel) =>
    (message: string, fields: LogFields = {}): void => {
      writeLine(JSON.stringify({ ...fields, ...context, level, message }));
    };
  return { info: logAt('INFO'), warn: logAt('WARN'), error: logAt('ERROR') };
}

/** An Error serialises to `{}`: this keeps its name, message, stack and the chain of causes. */
export function describeError(error: unknown): LogFields {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }
  const cause = error.cause === undefined ? {} : { cause: describeError(error.cause) };
  return { name: error.name, message: error.message, stack: error.stack, ...cause };
}
