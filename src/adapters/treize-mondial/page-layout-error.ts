/** The page does not have the shape the parser expects (D27): a problem of the source, not a bug (D42). */
export class PageLayoutError extends Error {
  override readonly name = 'PageLayoutError';
}
