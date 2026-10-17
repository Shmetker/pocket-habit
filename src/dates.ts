/**
 * Local calendar dates as YYYY-MM-DD strings.
 *
 * These helpers never call Date#toISOString(). That method formats the UTC
 * calendar day, which is a different day from the local one around midnight
 * and across time zones. Day stepping uses UTC date fields only as a pure
 * calendar calculator (year/month/day numbers), not as a time-zone conversion.
 */

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLocalDate(value: string): boolean {
  const match = LOCAL_DATE.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

export function parseLocalDate(value: string): { year: number; month: number; day: number } {
  if (!isLocalDate(value)) {
    throw new Error(`Expected a local YYYY-MM-DD date, received "${value}"`);
  }
  const match = LOCAL_DATE.exec(value);
  if (!match) {
    throw new Error(`Expected a local YYYY-MM-DD date, received "${value}"`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function formatUtcCalendarDate(utc: Date): string {
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Add calendar days to a YYYY-MM-DD string. DST cannot skip or repeat a day. */
export function addCalendarDays(isoDate: string, delta: number): string {
  const { year, month, day } = parseLocalDate(isoDate);
  return formatUtcCalendarDate(new Date(Date.UTC(year, month - 1, day + delta)));
}

/** Absolute number of calendar days between two YYYY-MM-DD strings. */
export function calendarDaysBetween(a: string, b: string): number {
  const [start, end] = a <= b ? [a, b] : [b, a];
  const left = parseLocalDate(start);
  const right = parseLocalDate(end);
  const ms =
    Date.UTC(right.year, right.month - 1, right.day) -
    Date.UTC(left.year, left.month - 1, left.day);
  return Math.round(ms / 86_400_000);
}

/**
 * Local YYYY-MM-DD for an instant in an IANA time zone.
 * Uses Intl parts so the result follows the zone's civil calendar, including
 * DST transitions, and never the UTC day from toISOString().
 */
export function formatLocalDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error(`Could not format a local date in zone "${timeZone}"`);
  }
  return `${year}-${month}-${day}`;
}

/** "Today, Fri 17" from the local civil date. */
export function formatTodayHeading(instant: Date, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(instant);
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone,
    day: 'numeric',
  }).format(instant);
  return `Today, ${weekday} ${day}`;
}
