import { readFileSync } from 'node:fs';

/** Reads a saved Treize Mondial page from this folder. */
export function readFixture(name: string): string {
  return readFileSync(new URL(name, import.meta.url), 'utf8');
}
