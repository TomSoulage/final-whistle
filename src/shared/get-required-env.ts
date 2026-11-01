/** Reads a variable the Lambda cannot run without; a missing one fails at cold start, with its name. */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}
