import type { Clock } from './clock';
import { localToday } from './clock';
import { bestAfterTick, bestAfterUntick } from './best';
import { computeStreak, type StreakResult } from './streak';

export type HabitView = {
  id: string;
  name: string;
  createdAt: string;
  best: number;
  dates: string[];
  doneToday: boolean;
  streak: StreakResult;
};

export function buildHabitView(
  record: { id: string; name: string; createdAt: string; best: number },
  dates: readonly string[],
  clock: Clock,
): HabitView {
  const today = localToday(clock);
  const sorted = [...dates].sort();
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    best: record.best,
    dates: sorted,
    doneToday: sorted.includes(today),
    streak: computeStreak(sorted, clock),
  };
}

export function applyTick(view: HabitView, clock: Clock): HabitView {
  const today = localToday(clock);
  if (view.dates.includes(today)) {
    return view;
  }
  const dates = [...view.dates, today].sort();
  const streak = computeStreak(dates, clock);
  return {
    ...view,
    dates,
    best: bestAfterTick(view.best, streak.current),
    doneToday: true,
    streak,
  };
}

export function applyUntick(view: HabitView, clock: Clock): HabitView {
  const today = localToday(clock);
  const dates = view.dates.filter((date) => date !== today);
  return {
    ...view,
    dates,
    best: bestAfterUntick(view.best),
    doneToday: false,
    streak: computeStreak(dates, clock),
  };
}
