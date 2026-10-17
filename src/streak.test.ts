import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { bestAfterTick, bestAfterUntick, bestAtAppOpen, historicalBest } from './best';
import { fixedClock } from './clock';
import { describeStreak } from './copy';
import { addCalendarDays, formatLocalDate } from './dates';
import { applyTick, applyUntick, buildHabitView } from './habit';
import { computeStreak } from './streak';

const UTC = 'UTC';

function clockOn(isoDate: string, timeZone = UTC) {
  return fixedClock(new Date(`${isoDate}T12:00:00Z`), timeZone);
}

function span(start: string, end: string, skip: ReadonlySet<string> = new Set()): string[] {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    if (!skip.has(cursor)) {
      dates.push(cursor);
    }
    cursor = addCalendarDays(cursor, 1);
  }
  return dates;
}

test('not ticked today keeps the streak through yesterday', () => {
  const dates = ['2026-10-14', '2026-10-15', '2026-10-16'];
  const result = computeStreak(dates, clockOn('2026-10-17'));
  assert.equal(result.current, 3);
  assert.equal(result.broken, false);
  assert.equal(result.grace.savedByGrace, false);
  assert.equal(result.grace.daysUntilGraceReturns, 0);
});

test('one-day gap uses grace and keeps the streak', () => {
  const dates = ['2026-10-14', '2026-10-15', '2026-10-17'];
  const result = computeStreak(dates, clockOn('2026-10-17'));
  assert.equal(result.current, 3);
  assert.equal(result.broken, false);
  assert.equal(result.grace.savedByGrace, true);
  assert.deepEqual(result.grace.graceDates, ['2026-10-16']);
  assert.equal(result.grace.daysUntilGraceReturns, 6);
  const caption = describeStreak(result, 3);
  assert.equal(caption.graceSavedLabel, 'Streak kept, grace day used');
  assert.equal(caption.graceReturnLabel, 'Grace back in 6 days');
  assert.equal(caption.showGraceDot, true);
});

test('two misses in a row end the streak', () => {
  const tickedToday = computeStreak(
    ['2026-10-13', '2026-10-14', '2026-10-17'],
    clockOn('2026-10-17'),
  );
  assert.equal(tickedToday.current, 1);
  assert.equal(tickedToday.grace.savedByGrace, false);
  assert.equal(tickedToday.broken, false);

  const notTicked = computeStreak(['2026-10-13', '2026-10-14'], clockOn('2026-10-17'));
  assert.equal(notTicked.current, 0);
  assert.equal(notTicked.broken, true);
  const caption = describeStreak(notTicked, 4);
  assert.equal(caption.countLabel, null);
  assert.equal(caption.brokenLabel, 'Start again, your best is 4');
  assert.equal(caption.showFlame, false);
});

test('two graces within 7 days — the second miss ends the streak', () => {
  const dates = span(
    '2026-10-01',
    '2026-10-17',
    new Set(['2026-10-10', '2026-10-15']),
  );
  const result = computeStreak(dates, clockOn('2026-10-17'));
  assert.equal(result.current, 6);
  assert.deepEqual(result.grace.graceDates, ['2026-10-15']);
  assert.equal(result.grace.savedByGrace, true);
  assert.equal(result.grace.daysUntilGraceReturns, 5);
  assert.equal(result.grace.graceDates.includes('2026-10-10'), false);
});

test('a later grace can replace an earlier one when they share a 7-day window', () => {
  const start = '2026-10-01';
  const skip = new Set([addCalendarDays(start, 1), addCalendarDays(start, 7)]);
  const dates = span(start, addCalendarDays(start, 11), skip);
  const today = addCalendarDays(start, 11);
  const result = computeStreak(dates, clockOn(today));
  assert.equal(result.current, 9);
  assert.equal(historicalBest(dates, clockOn(today)), 9);
});

test('DST spring-forward does not skip a local calendar day', () => {
  const zone = 'America/New_York';
  const beforeJump = new Date('2026-03-08T06:30:00Z');
  const afterJump = new Date('2026-03-08T07:30:00Z');
  assert.equal(formatLocalDate(beforeJump, zone), '2026-03-08');
  assert.equal(formatLocalDate(afterJump, zone), '2026-03-08');
  assert.equal(addCalendarDays('2026-03-07', 1), '2026-03-08');
  assert.equal(addCalendarDays('2026-03-08', 1), '2026-03-09');

  const dates = span('2026-03-01', '2026-03-10');
  const end = fixedClock(new Date('2026-03-10T16:00:00Z'), zone);
  assert.equal(formatLocalDate(end.now(), zone), '2026-03-10');
  const result = computeStreak(dates, end);
  assert.equal(result.current, 10);
  assert.equal(result.grace.savedByGrace, false);
});

test('DST fall-back does not double-count a local calendar day', () => {
  const zone = 'America/New_York';
  const firstOneThirty = new Date('2026-11-01T05:30:00Z');
  const secondOneThirty = new Date('2026-11-01T06:30:00Z');
  assert.equal(formatLocalDate(firstOneThirty, zone), '2026-11-01');
  assert.equal(formatLocalDate(secondOneThirty, zone), '2026-11-01');
  assert.equal(addCalendarDays('2026-11-01', 1), '2026-11-02');

  const dates = ['2026-10-30', '2026-10-31', '2026-11-01'];
  const result = computeStreak(dates, fixedClock(secondOneThirty, zone));
  assert.equal(result.current, 3);
});

test('time zone change moves local today and the streak with it', () => {
  const instant = new Date('2026-10-17T03:00:00Z');
  const tokyoToday = formatLocalDate(instant, 'Asia/Tokyo');
  const honoluluToday = formatLocalDate(instant, 'Pacific/Honolulu');
  assert.equal(tokyoToday, '2026-10-17');
  assert.equal(honoluluToday, '2026-10-16');
  assert.notEqual(honoluluToday, instant.toISOString().slice(0, 10));

  const dates = ['2026-10-17'];
  const tokyo = computeStreak(dates, fixedClock(instant, 'Asia/Tokyo'));
  const honolulu = computeStreak(dates, fixedClock(instant, 'Pacific/Honolulu'));
  assert.equal(tokyo.current, 1);
  assert.equal(honolulu.current, 0);
  assert.equal(honolulu.broken, false);
});

test('tick then untick the same day restores the previous streak and keeps Best', () => {
  const clock = clockOn('2026-10-17');
  const started = buildHabitView(
    { id: 'h1', name: 'Walk', createdAt: '2026-10-15', best: 2 },
    ['2026-10-15', '2026-10-16'],
    clock,
  );
  assert.equal(started.doneToday, false);
  assert.equal(started.streak.current, 2);

  const ticked = applyTick(started, clock);
  assert.equal(ticked.doneToday, true);
  assert.equal(ticked.streak.current, 3);
  assert.equal(ticked.best, 3);
  assert.equal(bestAfterTick(2, ticked.streak.current), 3);

  const unticked = applyUntick(ticked, clock);
  assert.equal(unticked.doneToday, false);
  assert.deepEqual(unticked.dates, started.dates);
  assert.equal(unticked.streak.current, started.streak.current);
  assert.equal(unticked.best, 3);
  assert.equal(bestAfterUntick(3), 3);
});

test('Best is computed at app open, raised by a tick, and never lowered', () => {
  const clock = clockOn('2026-10-17');
  const dates = span('2026-10-01', '2026-10-16');
  assert.equal(bestAtAppOpen(0, dates, clock), 16);
  assert.equal(bestAtAppOpen(20, dates, clock), 20);
  assert.equal(bestAfterTick(20, 16), 20);
  assert.equal(bestAfterUntick(20), 20);
});

test('10 habits over one year', () => {
  const habits = Array.from({ length: 10 }, (_, habitIndex) => {
    const dates: string[] = [];
    for (let day = 0; day < 366; day += 1) {
      const missed = day % 11 === 0;
      if (!missed) {
        dates.push(addCalendarDays('2025-10-17', day + habitIndex));
      }
    }
    return dates;
  });
  const clock = fixedClock(new Date('2026-10-18T12:00:00Z'), UTC);
  const start = performance.now();
  let total = 0;
  for (const dates of habits) {
    total += computeStreak(dates, clock).current;
    total += historicalBest(dates, clock);
  }
  const elapsed = performance.now() - start;
  assert.ok(total > 1000);
  assert.ok(elapsed < 500, `10 habits over one year took ${elapsed.toFixed(1)}ms`);
});

test('historical best matches the pure streak on every check-in day', () => {
  const skip = new Set(['2026-01-04', '2026-01-12', '2026-01-13', '2026-01-27']);
  const dates = span('2026-01-01', '2026-02-15', skip);
  let max = 0;
  for (const day of dates) {
    max = Math.max(max, computeStreak(dates, clockOn(day)).current);
  }
  assert.equal(historicalBest(dates, clockOn('2026-02-15')), max);
});

test('tick animation stays under 300ms', () => {
  const source = readFileSync(join(__dirname, 'feedback.ts'), 'utf8');
  const match = /export const TICK_ANIMATION_MS = (\d+)/.exec(source);
  assert.ok(match);
  const duration = Number(match?.[1]);
  assert.equal(duration, 220);
  assert.ok(duration < 300);
});

test('app source never formats today with toISOString()', () => {
  const root = join(__dirname, '..');
  const skip = new Set(['node_modules', 'dist', '.expo', 'web-build', '.git']);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) {
        continue;
      }
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (
        (path.endsWith('.ts') || path.endsWith('.tsx')) &&
        !path.endsWith('.test.ts') &&
        !path.endsWith('.d.ts')
      ) {
        files.push(path);
      }
    }
  };
  walk(root);
  const offenders = files.filter((path) => /\.toISOString\s*\(/.test(readFileSync(path, 'utf8')));
  assert.deepEqual(offenders, []);
});
