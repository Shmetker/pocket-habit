import type { StreakResult } from './streak';

export type StreakCaption = {
  countLabel: string | null;
  showFlame: boolean;
  /** "Best: 21" when the record is ahead of the current streak. */
  bestLabel: string | null;
  /** Shown instead of a large 0 when a previous streak has ended. */
  brokenLabel: string | null;
  idleLabel: string | null;
  graceSavedLabel: string | null;
  graceReturnLabel: string | null;
  showGraceDot: boolean;
};

function dayWord(count: number): string {
  return count === 1 ? 'day' : 'days';
}

export function describeStreak(streak: StreakResult, best: number): StreakCaption {
  if (streak.current === 0 && best > 0) {
    return {
      countLabel: null,
      showFlame: false,
      bestLabel: null,
      brokenLabel: `Start again, your best is ${best}`,
      idleLabel: null,
      graceSavedLabel: null,
      graceReturnLabel: null,
      showGraceDot: false,
    };
  }

  if (streak.current === 0) {
    return {
      countLabel: null,
      showFlame: false,
      bestLabel: null,
      brokenLabel: null,
      idleLabel: 'Tick today to start',
      graceSavedLabel: null,
      graceReturnLabel: null,
      showGraceDot: false,
    };
  }

  const graceBack = streak.grace.daysUntilGraceReturns;
  return {
    countLabel: `${streak.current} ${dayWord(streak.current)}`,
    showFlame: true,
    bestLabel: best > streak.current ? `Best: ${best}` : null,
    brokenLabel: null,
    idleLabel: null,
    graceSavedLabel: streak.grace.savedByGrace ? 'Streak kept, grace day used' : null,
    graceReturnLabel:
      graceBack > 0 ? `Grace back in ${graceBack} ${dayWord(graceBack)}` : null,
    showGraceDot: graceBack > 0,
  };
}
