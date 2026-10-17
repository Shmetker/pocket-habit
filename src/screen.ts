import type { Clock } from './clock';
import { localToday } from './clock';
import { isLocalDate } from './dates';
import { applyTick, applyUntick, buildHabitView, type HabitView } from './habit';

/**
 * Platform default when Plus Jakarta Sans fails to load.
 * `sans-serif` is a real family on web and Android; iOS uses the system font
 * when a family name is not installed.
 */
export const FALLBACK_FONT_FAMILY = 'sans-serif';

export type TapDecision =
  | { type: 'reload' }
  | { type: 'tick'; date: string; view: HabitView }
  | { type: 'untick'; date: string; view: HabitView };

/**
 * A tap is only valid for the civil day the row was built for.
 * Across midnight or a time-zone change, reload instead of treating the
 * previous `doneToday` as a check-in on the new local day.
 */
export function planTap(view: HabitView, clock: Clock, rowDate: string): TapDecision {
  const today = localToday(clock);
  if (rowDate !== today || view.asOf !== today || !isLocalDate(today)) {
    return { type: 'reload' };
  }
  if (view.doneToday) {
    if (!view.dates.includes(rowDate)) {
      return { type: 'reload' };
    }
    return { type: 'untick', date: rowDate, view: applyUntick(view, clock) };
  }
  return { type: 'tick', date: rowDate, view: applyTick(view, clock) };
}

/** Put back the check-in that was removed, and no other day. */
export function restoreRemovedDate(view: HabitView, removedDate: string, clock: Clock): HabitView {
  if (!isLocalDate(removedDate) || view.dates.includes(removedDate)) {
    return view;
  }
  const next = buildHabitView(
    { id: view.id, name: view.name, createdAt: view.createdAt, best: view.best },
    [...view.dates, removedDate],
    clock,
  );
  return next.best >= view.best ? next : { ...next, best: view.best };
}

/** Last-edit counter for one habit. A reload keeps screen rows only for ids edited after it started. */
export function noteHabitEdit(edits: Map<string, number>, habitId: string, counter: number): number {
  const next = counter + 1;
  edits.set(habitId, next);
  return next;
}

/** Habit ids whose last-edit counter moved after `started`. */
export function editsAfter(edits: ReadonlyMap<string, number>, started: number): Set<string> {
  const ids = new Set<string>();
  for (const [id, at] of edits) {
    if (at > started) {
      ids.add(id);
    }
  }
  return ids;
}

export type DeferredTap = {
  habitId: string;
  name: string;
  intended: 'tick' | 'untick';
};

/** The circle the user pressed, replayed only after that row is rebuilt for the new day. */
export function deferTap(view: HabitView): DeferredTap {
  return {
    habitId: view.id,
    name: view.name,
    intended: view.doneToday ? 'untick' : 'tick',
  };
}

/**
 * Apply a reload without letting an older read paint over a newer tap.
 * Habits not edited since the reload started take the fresh rows.
 * Best on screen never decreases.
 */
export function publishReload(
  screen: readonly HabitView[] | null,
  incoming: readonly HabitView[],
  editedIds: ReadonlySet<string>,
): HabitView[] {
  if (screen == null) {
    return incoming.slice();
  }
  const shownById = new Map(screen.map((item) => [item.id, item]));
  const merged = incoming.map((item) => {
    const shown = shownById.get(item.id);
    if (shown && editedIds.has(item.id)) {
      return item.best > shown.best ? { ...shown, best: item.best } : shown;
    }
    return keepBest(item, shown);
  });
  for (const item of screen) {
    if (!incoming.some((row) => row.id === item.id) && editedIds.has(item.id)) {
      merged.push(item);
    }
  }
  return merged;
}

export type SettledReload = {
  rows: HabitView[];
  deferred: DeferredTap | null;
  applied: Extract<TapDecision, { type: 'tick' | 'untick' }> | null;
  refreshAgain: boolean;
};

/**
 * Publish `incoming`, keep rows edited during this reload, then replay a
 * day-change tap once its row is for `clock`'s today. One follow-up refresh
 * is requested when any published row is still for another civil day.
 */
export function settleReload(input: {
  screen: readonly HabitView[] | null;
  incoming: readonly HabitView[];
  editedIds: ReadonlySet<string>;
  allowFollowUp: boolean;
  deferred: DeferredTap | null;
  clock: Clock;
}): SettledReload {
  let rows = publishReload(input.screen, input.incoming, input.editedIds);
  let deferred = input.deferred;
  let applied: SettledReload['applied'] = null;
  if (deferred) {
    const replay = replayDeferredTap(rows, deferred, input.clock);
    rows = replay.rows;
    if (replay.consumed) {
      deferred = null;
      applied = replay.applied;
    }
  }
  const today = localToday(input.clock);
  return {
    rows,
    deferred,
    applied,
    refreshAgain: input.allowFollowUp && rows.some((row) => row.asOf !== today),
  };
}

function replayDeferredTap(
  rows: readonly HabitView[],
  deferred: DeferredTap,
  clock: Clock,
): { rows: HabitView[]; consumed: boolean; applied: SettledReload['applied'] } {
  const today = localToday(clock);
  const index = rows.findIndex((row) => row.id === deferred.habitId);
  if (index < 0 || rows[index]?.asOf !== today) {
    return { rows: rows.slice(), consumed: false, applied: null };
  }
  const row = rows[index];
  if (!row) {
    return { rows: rows.slice(), consumed: false, applied: null };
  }
  const decision = planTap(row, clock, row.asOf);
  if (decision.type !== deferred.intended) {
    return { rows: rows.slice(), consumed: true, applied: null };
  }
  const next = rows.slice();
  next[index] = decision.view;
  return { rows: next, consumed: true, applied: decision };
}

function keepBest(incoming: HabitView, shown: HabitView | undefined): HabitView {
  if (!shown || incoming.best >= shown.best) {
    return incoming;
  }
  return { ...incoming, best: shown.best };
}

export function notebookCanOpen(fontsLoaded: boolean, fontFailed: boolean): boolean {
  return fontsLoaded || fontFailed;
}

export function homeIsBlocked(input: {
  fontsLoaded: boolean;
  fontFailed: boolean;
  habitsReady: boolean;
  failedToLoad: boolean;
}): boolean {
  if (!notebookCanOpen(input.fontsLoaded, input.fontFailed)) {
    return true;
  }
  if (input.failedToLoad) {
    return false;
  }
  return !input.habitsReady;
}

export function resolveFontFamily(family: string, fontFailed: boolean): string {
  return fontFailed ? FALLBACK_FONT_FAMILY : family;
}
