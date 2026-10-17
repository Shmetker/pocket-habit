import type { Clock } from './clock';
import { localToday } from './clock';
import { isLocalDate, parseLocalDate } from './dates';
import { GRACE_WINDOW_DAYS } from './streak';

/**
 * Best is the longest streak the habit has ever reached.
 *
 * It is computed from the full check-in history when the app opens, then
 * stored. A tick raises it when the new current streak is higher. An untick,
 * a missed day, or a shorter recompute never lowers the stored value.
 *
 * The historical maximum is the max of the pure streak function as of each
 * check-in day. A single left-to-right pass that always keeps the earliest
 * grace day undercounts: a later ending can drop that old grace and bridge a
 * more recent miss instead, producing a longer streak. Recomputing from each
 * check-in day matches `computeStreak`.
 */
function daySerial(isoDate: string): number {
  const { year, month, day } = parseLocalDate(isoDate);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * Length only. Matches `computeStreak` as of a check-in day: walk backward,
 * bridge a single miss when the rolling 7-day window allows it, and stop on
 * two misses or a second grace inside that window. Grace days do not add to
 * the count, so an unbridged trailing grace does not change the result.
 */
function streakLengthAsOf(checkins: ReadonlySet<number>, anchor: number, earliest: number): number {
  let current = 0;
  const graces: number[] = [];
  let previousWasMiss = false;
  let cursor = anchor;

  while (cursor >= earliest - 1) {
    if (checkins.has(cursor)) {
      current += 1;
      previousWasMiss = false;
    } else if (previousWasMiss || earliest >= cursor) {
      break;
    } else if (graces.some((grace) => grace - cursor < GRACE_WINDOW_DAYS)) {
      break;
    } else {
      graces.push(cursor);
      previousWasMiss = true;
    }
    cursor -= 1;
  }

  return current;
}

export function historicalBest(dates: readonly string[], clock: Clock): number {
  const today = localToday(clock);
  const serials = [
    ...new Set(
      dates
        .filter((date) => isLocalDate(date) && date <= today)
        .map((date) => daySerial(date)),
    ),
  ].sort((left, right) => left - right);

  if (serials.length === 0) {
    return 0;
  }

  const checkins = new Set(serials);
  const earliest = serials[0] ?? 0;
  let best = 0;
  for (const end of serials) {
    const length = streakLengthAsOf(checkins, end, earliest);
    if (length > best) {
      best = length;
    }
  }
  return best;
}

export function bestAfterTick(storedBest: number, streakAfterTick: number): number {
  return Math.max(storedBest, streakAfterTick);
}

/** Untick leaves Best untouched. */
export function bestAfterUntick(storedBest: number): number {
  return storedBest;
}

export function bestAtAppOpen(storedBest: number, dates: readonly string[], clock: Clock): number {
  return Math.max(storedBest, historicalBest(dates, clock));
}
