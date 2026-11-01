/** Kick-off times on the source page and every schedule are in French local time. */
export const PARIS_TIME_ZONE = 'Europe/Paris';

const ISO_DATE_LENGTH = 10;
const AT_EXPRESSION_LENGTH = 19;

const PARIS_PARTS_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: PARIS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * A wall-clock time in Paris (what a clock there shows), held in a Date whose UTC fields are that
 * wall clock. Adding hours to it ignores daylight saving changes, which happen at night, inside the
 * quiet hours, where every check is moved to the morning anyway.
 */
export type ParisWallClock = Date;

/** What a clock in Paris shows at this instant. */
export function toParisWallClock(instant: Date): ParisWallClock {
  const parts = new Map(PARIS_PARTS_FORMAT.formatToParts(instant).map(({ type, value }) => [type, value]));
  const getPart = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.get(type);
    if (value === undefined) {
      throw new Error(`Paris time of ${instant.toISOString()}: no ${type} in the formatted date`);
    }
    return value;
  };
  const date = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  return new Date(`${date}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}Z`);
}

/** `('2026-11-01', '15:00')` → that wall clock in Paris; an impossible one (`25:00`) fails. */
export function parseParisWallClock(isoDate: string, time: string): ParisWallClock {
  const wallClock = new Date(`${isoDate}T${time}:00Z`);
  if (Number.isNaN(wallClock.getTime())) {
    throw new Error(`invalid Paris wall clock "${isoDate} ${time}"`);
  }
  return wallClock;
}

/** The Paris date of a wall clock, `YYYY-MM-DD`. */
export function getParisDate(wallClock: ParisWallClock): string {
  return wallClock.toISOString().slice(0, ISO_DATE_LENGTH);
}

/** `YYYY-MM-DDTHH:MM:SS`, the format of a Scheduler `at()` expression and of the logs. */
export function formatParisWallClock(wallClock: ParisWallClock): string {
  return wallClock.toISOString().slice(0, AT_EXPRESSION_LENGTH);
}
