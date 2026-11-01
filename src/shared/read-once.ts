/**
 * Runs `read` on the first call only and shares its result with every later call, e.g. a secret
 * read on first use and kept for the life of the Lambda instance. A failed read is forgotten, so the
 * next call tries again.
 */
export function readOnce<T>(read: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= read().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}
