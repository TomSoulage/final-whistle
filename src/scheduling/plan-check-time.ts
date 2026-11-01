import type { DayMatch } from '../results/match-result.js';
import { parseParisWallClock, toParisWallClock, type ParisWallClock } from './paris-time.js';

const MINUTE_MS = 60_000;
const ONE_HOUR_MS = 3_600_000;
const TWO_HOURS_MS = 7_200_000;
const FOUR_HOURS_MS = 14_400_000;
const EIGHT_HOURS_MS = 28_800_000;
const DAY_MS = 86_400_000;
/** A match lasts about 1 h 40 with half-time, so its result is expected 2 h after kick-off (D4). */
const CHECK_DELAY_AFTER_KICK_OFF_MS = TWO_HOURS_MS;
/** When the page gives no kick-off time yet: 15:00, the most common kick-off, plus 2 h. */
const FALLBACK_CHECK_TIME = '17:00';
/** A schedule is never created in the past, nor so close to now that it could be. */
const MIN_DELAY_FROM_NOW_MS = MINUTE_MS;
/** No check, so no notification, from 23:00 to 08:00 (Paris): a check due then runs at 08:00. */
const QUIET_HOURS = { startHour: 23, endHour: 8 } as const;
/**
 * Wait before the next check, by failed attempt: 1 h, 1 h, 1 h, 2 h, 4 h, 8 h. The evening is checked
 * every hour, then less and less often until the next day; after the 7th attempt the match is given up (D35).
 */
const RETRY_DELAYS_MS = [ONE_HOUR_MS, ONE_HOUR_MS, ONE_HOUR_MS, TWO_HOURS_MS, FOUR_HOURS_MS, EIGHT_HOURS_MS] as const;

/** When to check a match of the day for the first time, in Paris wall-clock time. */
export function planFirstCheck(match: DayMatch, now: Date): ParisWallClock {
  const { date } = match.key;
  const expected =
    match.kickOff === null
      ? parseParisWallClock(date, FALLBACK_CHECK_TIME)
      : new Date(parseParisWallClock(date, match.kickOff).getTime() + CHECK_DELAY_AFTER_KICK_OFF_MS);
  const earliest = new Date(toParisWallClock(now).getTime() + MIN_DELAY_FROM_NOW_MS);
  return moveOutOfQuietHours(expected > earliest ? expected : earliest);
}

/** When to check again after this attempt found no score, or null once the attempts are used up. */
export function planRetry(failedAttempt: number, now: Date): ParisWallClock | null {
  const delay = RETRY_DELAYS_MS[failedAttempt - 1];
  if (delay === undefined) {
    return null;
  }
  return moveOutOfQuietHours(new Date(toParisWallClock(now).getTime() + delay));
}

/** A time inside the quiet hours becomes the end of the quiet hours; any other time is kept. */
export function moveOutOfQuietHours(wallClock: ParisWallClock): ParisWallClock {
  const hour = wallClock.getUTCHours();
  if (hour >= QUIET_HOURS.startHour) {
    return atQuietHoursEnd(new Date(wallClock.getTime() + DAY_MS));
  }
  if (hour < QUIET_HOURS.endHour) {
    return atQuietHoursEnd(wallClock);
  }
  return wallClock;
}

function atQuietHoursEnd(day: ParisWallClock): ParisWallClock {
  const morning = new Date(day);
  morning.setUTCHours(QUIET_HOURS.endHour, 0, 0, 0);
  return morning;
}
