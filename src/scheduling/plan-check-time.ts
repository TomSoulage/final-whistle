import type { DayMatch } from '../results/match-result.js';
import { parseParisWallClock, toParisWallClock, type ParisWallClock } from './paris-time.js';

const MINUTE_MS = 60_000;
/** 2 h: a match lasts about 1 h 40 with half-time, so its result is expected 2 h after kick-off (D4). */
const CHECK_DELAY_AFTER_KICK_OFF_MS = 7_200_000;
/** When the page gives no kick-off time yet: 15:00, the most common kick-off, plus 2 h. */
const FALLBACK_CHECK_TIME = '17:00';
/** A schedule is never created in the past, nor so close to now that it could be. */
const MIN_DELAY_FROM_NOW_MS = MINUTE_MS;
/** No check, so no notification, from 23:00 to 08:00 (Paris): a check due then runs at 08:00. */
const QUIET_HOURS = { startHour: 23, endHour: 8 } as const;
const DAY_MS = 86_400_000;

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
