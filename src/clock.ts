import { formatLocalDate } from './dates';

/**
 * Injected clock for streak math. `now` is an instant; `timeZone` is the IANA
 * zone whose civil calendar defines "today". Tests pass a fixed clock so DST
 * and zone changes are deterministic.
 */
export type Clock = {
  now(): Date;
  readonly timeZone: string;
};

export function systemClock(): Clock {
  return {
    now: () => new Date(),
    get timeZone() {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    },
  };
}

export function fixedClock(instant: Date, timeZone: string): Clock {
  return {
    now: () => instant,
    timeZone,
  };
}

export function localToday(clock: Clock): string {
  return formatLocalDate(clock.now(), clock.timeZone);
}
