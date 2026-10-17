import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { bestAfterTick, bestAfterUntick, bestAtAppOpen, historicalBest } from '../src/best';
import { fixedClock, localToday, type Clock } from '../src/clock';
import { describeStreak } from '../src/copy';
import { addCalendarDays, calendarDaysBetween, formatLocalDate, isLocalDate } from '../src/dates';
import { applyTick, applyUntick, buildHabitView } from '../src/habit';
import { computeStreak } from '../src/streak';
import { SCHEMA, SQL } from '../src/storage/schema';
import { colors } from '../src/theme';

const root = join(__dirname, '..');

function clockAt(instantIso: string, timeZone: string): Clock {
  return fixedClock(new Date(instantIso), timeZone);
}

function noon(isoDate: string, timeZone = 'UTC'): Clock {
  return clockAt(`${isoDate}T12:00:00Z`, timeZone);
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

function habit(
  dates: readonly string[],
  best: number,
  clock: Clock,
) {
  return buildHabitView(
    { id: 'h', name: 'Walk', createdAt: dates[0] ?? '2026-01-01', best },
    dates,
    clock,
  );
}

test('case 1: not yet ticked today keeps yesterday’s streak and does not spend grace', () => {
  const clock = noon('2026-10-17');
  const dates = ['2026-10-14', '2026-10-15', '2026-10-16'];
  const result = computeStreak(dates, clock);
  assert.equal(localToday(clock), '2026-10-17');
  assert.equal(result.current, 3);
  assert.equal(result.broken, false);
  assert.equal(result.grace.savedByGrace, false);
  assert.deepEqual(result.grace.graceDates, []);
  assert.equal(result.grace.daysUntilGraceReturns, 0);

  const view = habit(dates, 3, clock);
  assert.equal(view.doneToday, false);
  const caption = describeStreak(result, 3);
  assert.equal(caption.countLabel, '3 days');
  assert.equal(caption.brokenLabel, null);
  assert.equal(caption.graceSavedLabel, null);
  assert.equal(caption.showGraceDot, false);
});

test('case 2: one missed day uses grace and does not add to the count', () => {
  const clock = noon('2026-10-17');
  const dates = ['2026-10-14', '2026-10-15', '2026-10-17'];
  const result = computeStreak(dates, clock);
  assert.equal(result.current, 3);
  assert.deepEqual(result.grace.graceDates, ['2026-10-16']);
  assert.equal(result.grace.savedByGrace, true);
  assert.equal(result.grace.daysUntilGraceReturns, 6);
  const caption = describeStreak(result, 3);
  assert.equal(caption.graceSavedLabel, 'Streak kept, grace day used');
  assert.equal(caption.graceReturnLabel, 'Grace back in 6 days');
  assert.equal(caption.showGraceDot, true);

  // Today still open: missing yesterday is the one grace day.
  const open = computeStreak(['2026-10-14', '2026-10-15'], clock);
  assert.equal(open.current, 2);
  assert.deepEqual(open.grace.graceDates, ['2026-10-16']);
  assert.equal(open.grace.savedByGrace, true);
  assert.equal(open.broken, false);
});

test('case 3: two misses in a row break the streak', () => {
  const clock = noon('2026-10-17');
  const ticked = computeStreak(['2026-10-13', '2026-10-14', '2026-10-17'], clock);
  assert.equal(ticked.current, 1);
  assert.equal(ticked.grace.savedByGrace, false);
  assert.equal(ticked.broken, false);

  const open = computeStreak(['2026-10-13', '2026-10-14'], clock);
  assert.equal(open.current, 0);
  assert.equal(open.broken, true);
  const caption = describeStreak(open, 4);
  assert.equal(caption.countLabel, null);
  assert.equal(caption.brokenLabel, 'Start again, your best is 4');
  assert.equal(caption.showFlame, false);
  assert.equal(caption.graceSavedLabel, null);
});

test('case 4: two graces inside one 7-day window, and graces 7 and 8 days apart', () => {
  const today = '2026-10-20';
  const clock = noon(today);

  const within = computeStreak(span('2026-10-01', today, new Set(['2026-10-05', '2026-10-11'])), clock);
  assert.equal(calendarDaysBetween('2026-10-05', '2026-10-11'), 6);
  assert.deepEqual(within.grace.graceDates, ['2026-10-11']);
  assert.equal(within.grace.graceDates.includes('2026-10-05'), false);
  assert.equal(within.current, 14);
  assert.equal(within.grace.savedByGrace, true);

  const seven = computeStreak(span('2026-10-01', today, new Set(['2026-10-05', '2026-10-12'])), clock);
  assert.equal(calendarDaysBetween('2026-10-05', '2026-10-12'), 7);
  assert.deepEqual([...seven.grace.graceDates].sort(), ['2026-10-05', '2026-10-12']);
  assert.equal(seven.current, 18);
  assert.equal(seven.grace.daysUntilGraceReturns, 0);

  const eight = computeStreak(span('2026-10-01', today, new Set(['2026-10-05', '2026-10-13'])), clock);
  assert.equal(calendarDaysBetween('2026-10-05', '2026-10-13'), 8);
  assert.deepEqual([...eight.grace.graceDates].sort(), ['2026-10-05', '2026-10-13']);
  assert.equal(eight.current, 18);

  const recent = computeStreak(
    span('2026-10-01', '2026-10-17', new Set(['2026-10-09', '2026-10-16'])),
    noon('2026-10-17'),
  );
  assert.equal(calendarDaysBetween('2026-10-09', '2026-10-16'), 7);
  assert.deepEqual([...recent.grace.graceDates].sort(), ['2026-10-09', '2026-10-16']);
  assert.equal(recent.grace.daysUntilGraceReturns, 6);
  assert.equal(describeStreak(recent, recent.current).graceReturnLabel, 'Grace back in 6 days');
});

test('case 5: US and Europe DST transitions do not skip or repeat a local calendar day', () => {
  const transitions: { zone: string; spring: string; fall: string }[] = [
    { zone: 'America/New_York', spring: '2026-03-08', fall: '2026-11-01' },
    { zone: 'America/Los_Angeles', spring: '2026-03-08', fall: '2026-11-01' },
    { zone: 'Europe/Berlin', spring: '2026-03-29', fall: '2026-10-25' },
    { zone: 'Europe/London', spring: '2026-03-29', fall: '2026-10-25' },
  ];

    for (const { zone, spring, fall } of transitions) {
      for (const day of [spring, fall]) {
        const start = new Date(`${addCalendarDays(day, -2)}T12:00:00Z`);
        const end = new Date(`${addCalendarDays(day, 2)}T12:00:00Z`);
        const seen: string[] = [];
        for (let ms = start.getTime(); ms <= end.getTime(); ms += 15 * 60 * 1000) {
          const local = formatLocalDate(new Date(ms), zone);
          assert.match(local, /^\d{4}-\d{2}-\d{2}$/);
          if (seen[seen.length - 1] !== local) {
            seen.push(local);
          }
        }
        for (let index = 1; index < seen.length; index += 1) {
          assert.equal(seen[index], addCalendarDays(seen[index - 1]!, 1));
        }
        assert.ok(seen.includes(addCalendarDays(day, -1)));
        assert.ok(seen.includes(day));
        assert.ok(seen.includes(addCalendarDays(day, 1)));
      }

    const dates = span(addCalendarDays(spring, -5), spring);
    const streak = computeStreak(dates, clockAt(`${spring}T18:00:00Z`, zone));
    assert.equal(formatLocalDate(new Date(`${spring}T18:00:00Z`), zone), spring);
    assert.equal(streak.current, dates.length);
    assert.equal(streak.grace.savedByGrace, false);

    const fallDates = span(addCalendarDays(fall, -3), fall);
    const fallStreak = computeStreak(fallDates, clockAt(`${fall}T20:00:00Z`, zone));
    assert.equal(fallStreak.current, fallDates.length);
    assert.equal(fallStreak.grace.savedByGrace, false);
  }

  // US spring-forward: 2026-03-08 02:00 EST becomes 03:00 EDT.
  assert.equal(formatLocalDate(new Date('2026-03-08T06:59:59Z'), 'America/New_York'), '2026-03-08');
  assert.equal(formatLocalDate(new Date('2026-03-08T07:00:00Z'), 'America/New_York'), '2026-03-08');
  // US fall-back: 01:30 EDT and 01:30 EST are the same local date.
  assert.equal(formatLocalDate(new Date('2026-11-01T05:30:00Z'), 'America/New_York'), '2026-11-01');
  assert.equal(formatLocalDate(new Date('2026-11-01T06:30:00Z'), 'America/New_York'), '2026-11-01');
  // Europe spring-forward: 2026-03-29 02:00 CET becomes 03:00 CEST.
  assert.equal(formatLocalDate(new Date('2026-03-29T00:59:59Z'), 'Europe/Berlin'), '2026-03-29');
  assert.equal(formatLocalDate(new Date('2026-03-29T01:00:00Z'), 'Europe/Berlin'), '2026-03-29');
  // Europe fall-back: both 02:30 local times are 2026-10-25.
  assert.equal(formatLocalDate(new Date('2026-10-25T00:30:00Z'), 'Europe/Berlin'), '2026-10-25');
  assert.equal(formatLocalDate(new Date('2026-10-25T01:30:00Z'), 'Europe/Berlin'), '2026-10-25');
  assert.equal(formatLocalDate(new Date('2026-03-29T00:30:00Z'), 'Europe/London'), '2026-03-29');
  assert.equal(formatLocalDate(new Date('2026-10-25T01:30:00Z'), 'Europe/London'), '2026-10-25');
});

test('case 6: a time zone change moves local today and leaves stored dates alone', () => {
  const instant = new Date('2026-10-17T03:30:00Z');
  const ny = formatLocalDate(instant, 'America/New_York');
  const berlin = formatLocalDate(instant, 'Europe/Berlin');
  const kiritimati = formatLocalDate(instant, 'Pacific/Kiritimati');
  const pago = formatLocalDate(instant, 'Pacific/Pago_Pago');
  assert.equal(ny, '2026-10-16');
  assert.equal(berlin, '2026-10-17');
  assert.notEqual(ny, instant.toISOString().slice(0, 10));

  const dates = ['2026-10-14', '2026-10-15', '2026-10-16'];
  const inNy = computeStreak(dates, fixedClock(instant, 'America/New_York'));
  const inBerlin = computeStreak(dates, fixedClock(instant, 'Europe/Berlin'));
  assert.equal(inNy.current, 3);
  assert.equal(inNy.grace.savedByGrace, false);
  assert.equal(inBerlin.current, 3);
  assert.equal(inBerlin.grace.savedByGrace, false);
  assert.equal(inBerlin.broken, false);

  const futureInNy = computeStreak(['2026-10-17'], fixedClock(instant, 'America/New_York'));
  const todayInBerlin = computeStreak(['2026-10-17'], fixedClock(instant, 'Europe/Berlin'));
  assert.equal(futureInNy.current, 0);
  assert.equal(futureInNy.broken, false);
  assert.equal(todayInBerlin.current, 1);

  // Same instant can fall on different civil dates. A one-day gap still uses grace.
  assert.equal(kiritimati, '2026-10-17');
  assert.equal(pago, '2026-10-16');
  const far = new Date('2026-10-17T10:30:00Z');
  assert.equal(formatLocalDate(far, 'Pacific/Kiritimati'), '2026-10-18');
  assert.equal(formatLocalDate(far, 'Pacific/Pago_Pago'), '2026-10-16');
  const line = computeStreak(['2026-10-16'], fixedClock(far, 'Pacific/Kiritimati'));
  const pagoStreak = computeStreak(['2026-10-16'], fixedClock(far, 'Pacific/Pago_Pago'));
  assert.equal(line.current, 1);
  assert.deepEqual(line.grace.graceDates, ['2026-10-17']);
  assert.equal(line.grace.savedByGrace, true);
  assert.equal(pagoStreak.current, 1);
  assert.equal(pagoStreak.grace.savedByGrace, false);
});

test('case 7: tick and untick the same local day, and a duplicate insert does not throw', () => {
  const clock = noon('2026-10-17');
  const started = habit(['2026-10-15', '2026-10-16'], 2, clock);
  assert.equal(started.doneToday, false);
  assert.equal(started.streak.current, 2);

  const ticked = applyTick(started, clock);
  assert.equal(ticked.doneToday, true);
  assert.deepEqual(ticked.dates, ['2026-10-15', '2026-10-16', '2026-10-17']);
  assert.equal(ticked.streak.current, 3);
  assert.equal(ticked.best, 3);

  const unticked = applyUntick(ticked, clock);
  assert.equal(unticked.doneToday, false);
  assert.deepEqual(unticked.dates, started.dates);
  assert.equal(unticked.streak.current, 2);
  assert.equal(unticked.best, 3);
  assert.equal(bestAfterUntick(unticked.best), 3);
  assert.ok(bestAfterTick(3, 1) >= 3);

  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec(SCHEMA);
  database.prepare(SQL.insertHabit).run('habit-1', 'Walk', '2026-10-15');
  database.prepare(SQL.insertCheckin).run('habit-1', '2026-10-17');
  database.prepare(SQL.insertCheckin).run('habit-1', '2026-10-17');
  const row = database.prepare('SELECT COUNT(*) AS count FROM checkins').get() as { count: number };
  assert.equal(row.count, 1);
  database.prepare(SQL.deleteCheckin).run('habit-1', '2026-10-17');
  database.prepare(SQL.insertCheckin).run('habit-1', '2026-10-17');
  const again = database.prepare('SELECT date FROM checkins').all() as { date: string }[];
  assert.deepEqual(again.map((item) => item.date), ['2026-10-17']);
  database.prepare(SQL.raiseBest).run(3, 'habit-1', 3);
  database.prepare(SQL.raiseBest).run(1, 'habit-1', 1);
  const best = database.prepare(SQL.readBest).get('habit-1') as { best: number };
  assert.equal(best.best, 3);
  database.close();
});

test('case 8: 10 habits over one year stay correct and finish quickly', () => {
  const today = '2026-10-18';
  const clock = noon(today);
  const habits = Array.from({ length: 10 }, (_, habitIndex) => {
    const dates: string[] = [];
    for (let day = 0; day < 366; day += 1) {
      if (day % 11 !== 0) {
        dates.push(addCalendarDays('2025-10-17', day + habitIndex));
      }
    }
    return dates;
  });

  const start = performance.now();
  let total = 0;
  for (const dates of habits) {
    const visible = dates.filter((date) => date <= today);
    const result = computeStreak(visible, clock);
    const best = historicalBest(visible, clock);
    total += result.current + best;

    const graces = [...result.grace.graceDates].sort();
    for (let index = 1; index < graces.length; index += 1) {
      assert.ok(calendarDaysBetween(graces[index - 1]!, graces[index]!) >= 7);
    }
    for (const grace of graces) {
      assert.equal(visible.includes(grace), false);
    }
    assert.ok(best >= result.current);
    assert.equal(result.broken, false);
    assert.equal(best, visible.length);
    assert.equal(result.current, visible.length);
  }
  const elapsed = performance.now() - start;
  assert.ok(total > 1000);
  assert.ok(elapsed < 500, `10 habits over one year took ${elapsed.toFixed(1)}ms`);
});

test('historical best matches the pure streak on every day, including grace swaps', () => {
  const samples: string[][] = [];
  for (let seed = 1; seed <= 40; seed += 1) {
    const dates: string[] = [];
    let cursor = '2026-01-01';
    for (let day = 0; day < 48; day += 1) {
      const roll = (seed * 17 + day * 13) % 10;
      if (roll !== 0) {
        dates.push(cursor);
      }
      cursor = addCalendarDays(cursor, 1);
    }
    samples.push(dates);
  }
  samples.push(span('2026-03-01', '2026-04-15', new Set(['2026-03-08', '2026-03-15', '2026-03-16'])));
  samples.push(span('2024-02-27', '2024-03-02'));

  for (const dates of samples) {
    const visible = dates.filter((date) => isLocalDate(date));
    if (visible.length === 0) {
      continue;
    }
    const end = visible[visible.length - 1]!;
    let max = 0;
    let day = visible[0]!;
    while (day <= end) {
      max = Math.max(max, computeStreak(visible, noon(day)).current);
      day = addCalendarDays(day, 1);
    }
    assert.equal(historicalBest(visible, noon(end)), max);
    assert.ok(bestAtAppOpen(0, visible, noon(end)) >= computeStreak(visible, noon(end)).current);
    assert.equal(bestAtAppOpen(max + 3, visible, noon(end)), max + 3);
  }

  const leap = computeStreak(['2024-02-28', '2024-02-29', '2024-03-01'], noon('2024-03-01'));
  assert.equal(leap.current, 3);
  assert.equal(leap.grace.savedByGrace, false);
});

test('best is raised on open and after a tick, and a lower write does not stick', () => {
  const clock = noon('2026-10-17');
  const dates = span('2026-10-01', '2026-10-16');
  assert.equal(bestAtAppOpen(0, dates, clock), 16);
  assert.equal(bestAtAppOpen(20, dates, clock), 20);
  assert.equal(bestAfterTick(20, 17), 20);
  assert.equal(bestAfterTick(16, 17), 17);
  assert.equal(bestAfterUntick(17), 17);

  const view = habit(dates, 16, clock);
  const ticked = applyTick(view, clock);
  assert.equal(ticked.best, 17);
  const unticked = applyUntick(ticked, clock);
  assert.equal(unticked.best, 17);
  assert.ok(unticked.best >= ticked.best);
});

test('midnight local boundary is the civil date, not the UTC date', () => {
  const zones: { zone: string; before: string; after: string; beforeDate: string; afterDate: string }[] = [
    {
      zone: 'America/New_York',
      before: '2026-10-17T03:59:59Z',
      after: '2026-10-17T04:00:00Z',
      beforeDate: '2026-10-16',
      afterDate: '2026-10-17',
    },
    {
      zone: 'America/Los_Angeles',
      before: '2026-10-17T06:59:59Z',
      after: '2026-10-17T07:00:00Z',
      beforeDate: '2026-10-16',
      afterDate: '2026-10-17',
    },
    {
      zone: 'Europe/Berlin',
      before: '2026-10-16T21:59:59Z',
      after: '2026-10-16T22:00:00Z',
      beforeDate: '2026-10-16',
      afterDate: '2026-10-17',
    },
    {
      zone: 'Europe/London',
      before: '2026-10-16T22:59:59Z',
      after: '2026-10-16T23:00:00Z',
      beforeDate: '2026-10-16',
      afterDate: '2026-10-17',
    },
  ];

  for (const item of zones) {
    assert.equal(formatLocalDate(new Date(item.before), item.zone), item.beforeDate);
    assert.equal(formatLocalDate(new Date(item.after), item.zone), item.afterDate);
    const dates = [item.beforeDate];
    const before = computeStreak(dates, clockAt(item.before, item.zone));
    const after = computeStreak(dates, clockAt(item.after, item.zone));
    assert.equal(before.current, 1);
    assert.equal(before.grace.savedByGrace, false);
    assert.equal(after.current, 1);
    assert.equal(after.grace.savedByGrace, false);
    assert.equal(after.broken, false);
  }
});

test('sweep: app source does not format dates with toISOString, colors and headers match', () => {
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
      } else if (/\.(ts|tsx|mjs|js)$/.test(path) && !path.endsWith('.test.ts') && !path.endsWith('.d.ts')) {
        files.push(path);
      }
    }
  };
  walk(root);
  const offenders = files.filter((path) => /\.toISOString\s*\(/.test(readFileSync(path, 'utf8')));
  assert.deepEqual(offenders, []);

  assert.equal(colors.done, '#22A06B');
  assert.equal(colors.action, '#1A8457');
  assert.equal(colors.grace, '#9A6010');

  const headers = readFileSync(join(root, 'public/_headers'), 'utf8');
  assert.match(headers, /Cross-Origin-Opener-Policy:\s*same-origin/);
  assert.match(headers, /Cross-Origin-Embedder-Policy:\s*require-corp/);

  const ignore = readFileSync(join(root, '.gitignore'), 'utf8');
  for (const pattern of ['node_modules', '.expo', 'dist', '.env*']) {
    assert.match(ignore, new RegExp(pattern.replace(/[.*]/g, '\\$&').replace('\\*', '.*')));
  }

  const source = [
    readFileSync(join(root, 'App.tsx'), 'utf8'),
    readFileSync(join(root, 'src/components/CheckCircle.tsx'), 'utf8'),
    readFileSync(join(root, 'src/components/AddHabitSheet.tsx'), 'utf8'),
    readFileSync(join(root, 'src/components/HabitRow.tsx'), 'utf8'),
    readFileSync(join(root, 'src/feedback.ts'), 'utf8'),
  ].join('\n');
  assert.equal(/Alert\.|confirm\(/.test(source), false);
  assert.match(source, /TICK_ANIMATION_MS/);
  assert.match(readFileSync(join(root, 'src/feedback.ts'), 'utf8'), /TICK_ANIMATION_MS = 220/);
  assert.match(source, /playTickHaptic/);
  assert.match(source, /AppState\.addEventListener\('change'/);
});
