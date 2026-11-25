/**
 * The source could not be read: down, an HTTP error, or a page that cannot be parsed. Every source adapter throws
 * this for a problem on the source side, so the pipeline logs it instead of raising an alert (D42).
 */
export class SourceUnavailableError extends Error {
  override readonly name = 'SourceUnavailableError';
}
