import type { Clock } from './clock';
import { localToday } from './clock';
import { addCalendarDays, calendarDaysBetween, isLocalDate } from './dates';

/**
 * Grace is a rolling 7-day window on the local calendar.
 *
 * A grace day is one missed YYYY-MM-DD that stays inside the streak instead of
 * breaking it. Check-in days are what the streak counts; a grace day does not
 * add a day to the count.
 *
 * At most one grace day may sit inside any window of 7 consecutive local
 * dates. Two grace dates G1 < G2 are allowed only when they are at least 7
 * calendar days apart (`calendarDaysBetween(G1, G2) >= 7`). A gap of 6 days
 * still shares a 7-day window, so the older miss ends the streak.
 *
 * Two missed days in a row always end the streak, even when grace is available.
 * The walk starts at today when today is ticked, otherwise at yesterday — today
 * is still open until it is ticked, so an empty today is not itself a miss.
 *
 * `daysUntilGraceReturns` is how many local days remain until the most recent
 * grace day in the current streak falls outside the rolling window:
 * `max(0, 7 - calendarDaysBetween(latestGrace, today))`. Zero means a new
 * grace day is allowed.
 */
export const GRACE_WINDOW_DAYS = 7;

export type GraceState = {
  /** Bridging grace days in the current streak, oldest first. */
  graceDates: string[];
  /** True when a grace day is what keeps this streak connected. */
  savedByGrace: boolean;
  /** Days until grace can be used again. 0 means grace is available. */
  daysUntilGraceReturns: number;
};

export type StreakResult = {
  /** Check-in days in the current streak. Grace days are not included. */
  current: number;
  /** True when the habit has check-ins but none of them form a live streak. */
  broken: boolean;
  grace: GraceState;
};

const EMPTY_GRACE: GraceState = {
  graceDates: [],
  savedByGrace: false,
  daysUntilGraceReturns: 0,
};

function emptyResult(broken: boolean): StreakResult {
  return { current: 0, broken, grace: EMPTY_GRACE };
}

function datesOnOrBefore(dates: readonly string[], today: string): string[] {
  return [...new Set(dates.filter((date) => isLocalDate(date) && date <= today))].sort();
}

/**
 * Pure streak. Inputs are check-in dates plus a clock. Output is the current
 * streak and the grace state, including days until grace returns.
 */
export function computeStreak(dates: readonly string[], clock: Clock): StreakResult {
  return computeStreakEndingOn(dates, localToday(clock));
}

export function computeStreakEndingOn(dates: readonly string[], today: string): StreakResult {
  const unique = datesOnOrBefore(dates, today);
  if (unique.length === 0) {
    return emptyResult(false);
  }

  const set = new Set(unique);
  const anchor = set.has(today) ? today : addCalendarDays(today, -1);
  const earliest = unique[0] ?? anchor;
  const steps: { date: string; kind: 'check' | 'grace' }[] = [];
  let previousWasMiss = false;
  let cursor = anchor;
  const stopAt = addCalendarDays(earliest, -1);

  while (cursor >= stopAt) {
    if (set.has(cursor)) {
      steps.push({ date: cursor, kind: 'check' });
      previousWasMiss = false;
    } else {
      if (previousWasMiss) {
        break;
      }
      const blocked = steps.some(
        (step) =>
          step.kind === 'grace' && calendarDaysBetween(cursor, step.date) < GRACE_WINDOW_DAYS,
      );
      if (blocked) {
        break;
      }
      const bridgesToOlderCheckin = unique.some((date) => date < cursor);
      if (!bridgesToOlderCheckin) {
        break;
      }
      steps.push({ date: cursor, kind: 'grace' });
      previousWasMiss = true;
    }
    cursor = addCalendarDays(cursor, -1);
  }

  while (steps.length > 0 && steps[steps.length - 1]?.kind === 'grace') {
    steps.pop();
  }

  const graceDates = steps.filter((step) => step.kind === 'grace').map((step) => step.date);
  const current = steps.reduce((count, step) => (step.kind === 'check' ? count + 1 : count), 0);
  if (current === 0) {
    return emptyResult(true);
  }

  const latestGrace = graceDates.reduce<string | null>(
    (latest, date) => (latest === null || date > latest ? date : latest),
    null,
  );
  const daysUntilGraceReturns =
    latestGrace === null
      ? 0
      : Math.max(0, GRACE_WINDOW_DAYS - calendarDaysBetween(latestGrace, today));

  return {
    current,
    broken: false,
    grace: {
      graceDates,
      savedByGrace: graceDates.length > 0,
      daysUntilGraceReturns,
    },
  };
}
