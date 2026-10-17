import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { fixedClock, localToday, type Clock } from './clock';
import { applyTick, applyUntick, buildHabitView, type HabitView } from './habit';
import {
  FALLBACK_FONT_FAMILY,
  homeIsBlocked,
  markLocalChange,
  notebookCanOpen,
  planTap,
  publishReload,
  resolveFontFamily,
  restoreRemovedDate,
} from './screen';
import { font } from './theme';

function clockAt(iso: string, timeZone: string): Clock {
  return fixedClock(new Date(iso), timeZone);
}

function viewFor(dates: readonly string[], best: number, clock: Clock): HabitView {
  return buildHabitView(
    { id: 'h', name: 'Walk', createdAt: dates[0] ?? '2026-10-15', best },
    dates,
    clock,
  );
}

test('a tap after midnight reloads instead of deleting the new day', () => {
  const yesterday = clockAt('2026-10-17T23:30:00Z', 'UTC');
  const today = clockAt('2026-10-18T00:10:00Z', 'UTC');
  const row = viewFor(['2026-10-15', '2026-10-16', '2026-10-17'], 3, yesterday);
  assert.equal(row.asOf, '2026-10-17');
  assert.equal(row.doneToday, true);
  assert.equal(localToday(today), '2026-10-18');

  const decision = planTap(row, today, row.asOf);
  assert.equal(decision.type, 'reload');
  assert.deepEqual(row.dates, ['2026-10-15', '2026-10-16', '2026-10-17']);
  assert.equal(applyUntick(row, today), row);
  assert.equal(applyTick(row, today).dates.includes('2026-10-18'), false);
});

test('a time zone change reloads instead of writing the new local day', () => {
  const instant = '2026-10-17T03:00:00Z';
  const tokyo = clockAt(instant, 'Asia/Tokyo');
  const honolulu = clockAt(instant, 'Pacific/Honolulu');
  assert.equal(localToday(tokyo), '2026-10-17');
  assert.equal(localToday(honolulu), '2026-10-16');

  const row = viewFor(['2026-10-17'], 1, tokyo);
  assert.equal(row.doneToday, true);
  const decision = planTap(row, honolulu, row.asOf);
  assert.equal(decision.type, 'reload');
  assert.equal(row.dates.includes('2026-10-16'), false);
  assert.equal(row.best, 1);
});

test('undo restores only the date that was removed', () => {
  const clock = clockAt('2026-10-17T15:00:00Z', 'UTC');
  const nextDay = clockAt('2026-10-18T15:00:00Z', 'UTC');
  const row = viewFor(['2026-10-15', '2026-10-16', '2026-10-17'], 3, clock);
  const decision = planTap(row, clock, row.asOf);
  assert.equal(decision.type, 'untick');
  if (decision.type !== 'untick') {
    return;
  }
  assert.equal(decision.date, '2026-10-17');
  assert.equal(decision.view.dates.includes('2026-10-17'), false);
  assert.equal(decision.view.best, 3);

  const restored = restoreRemovedDate(decision.view, decision.date, nextDay);
  assert.deepEqual(restored.dates, ['2026-10-15', '2026-10-16', '2026-10-17']);
  assert.equal(restored.dates.includes('2026-10-18'), false);
  assert.ok(restored.best >= decision.view.best);

  const alreadyThere = restoreRemovedDate(restored, decision.date, nextDay);
  assert.equal(alreadyThere, restored);
});

test('a same-day tick still updates that row date', () => {
  const clock = clockAt('2026-10-17T15:00:00Z', 'UTC');
  const row = viewFor(['2026-10-15', '2026-10-16'], 2, clock);
  assert.equal(row.doneToday, false);
  const decision = planTap(row, clock, row.asOf);
  assert.equal(decision.type, 'tick');
  if (decision.type !== 'tick') {
    return;
  }
  assert.equal(decision.date, '2026-10-17');
  assert.equal(decision.view.doneToday, true);
  assert.equal(decision.view.best, 3);
  assert.deepEqual(decision.view.dates, ['2026-10-15', '2026-10-16', '2026-10-17']);
});

test('a stale reload keeps the newer tick and does not drop Best', () => {
  const clock = clockAt('2026-10-17T15:00:00Z', 'UTC');
  const before = viewFor(['2026-10-15', '2026-10-16'], 2, clock);
  let generation = 0;
  const startedAt = generation;
  const decision = planTap(before, clock, before.asOf);
  assert.equal(decision.type, 'tick');
  if (decision.type !== 'tick') {
    return;
  }
  generation = markLocalChange(generation);
  const screen = [decision.view];
  assert.equal(screen[0]?.doneToday, true);
  assert.equal(screen[0]?.best, 3);

  const staleRead = [before];
  const published = publishReload(screen, staleRead, generation !== startedAt);
  assert.equal(published[0]?.doneToday, true);
  assert.equal(published[0]?.asOf, '2026-10-17');
  assert.deepEqual(published[0]?.dates, screen[0]?.dates);
  assert.equal(published[0]?.best, 3);
  assert.ok((published[0]?.best ?? 0) >= (screen[0]?.best ?? 0));
});

test('a fresh reload can move to the new day without lowering Best', () => {
  const yesterday = clockAt('2026-10-17T15:00:00Z', 'UTC');
  const today = clockAt('2026-10-18T15:00:00Z', 'UTC');
  const screen = viewFor(['2026-10-15', '2026-10-16', '2026-10-17'], 5, yesterday);
  const incoming = viewFor(['2026-10-15', '2026-10-16', '2026-10-17'], 2, today);
  assert.equal(screen.doneToday, true);
  assert.equal(incoming.doneToday, false);
  assert.equal(incoming.asOf, '2026-10-18');

  const published = publishReload([screen], [incoming], false);
  assert.equal(published[0]?.doneToday, false);
  assert.equal(published[0]?.asOf, '2026-10-18');
  assert.equal(published[0]?.best, 5);
  assert.ok((published[0]?.best ?? 0) >= screen.best);
  assert.ok((published[0]?.best ?? 0) >= incoming.best);
});

test('a stale reload still adds a habit the screen has not shown yet', () => {
  const clock = clockAt('2026-10-17T15:00:00Z', 'UTC');
  const shown = viewFor(['2026-10-17'], 1, clock);
  const added = buildHabitView(
    { id: 'new', name: 'Read', createdAt: '2026-10-17', best: 0 },
    [],
    clock,
  );
  const published = publishReload([shown], [shown, added], true);
  assert.deepEqual(
    published.map((item) => item.id),
    ['h', 'new'],
  );
  assert.equal(published[0]?.best, 1);
});

test('a font load error opens the notebook with the fallback family', () => {
  assert.equal(notebookCanOpen(false, false), false);
  assert.equal(notebookCanOpen(false, true), true);
  assert.equal(notebookCanOpen(true, false), true);

  assert.equal(
    homeIsBlocked({
      fontsLoaded: false,
      fontFailed: false,
      habitsReady: false,
      failedToLoad: false,
    }),
    true,
  );
  assert.equal(
    homeIsBlocked({
      fontsLoaded: false,
      fontFailed: true,
      habitsReady: false,
      failedToLoad: false,
    }),
    true,
  );
  assert.equal(
    homeIsBlocked({
      fontsLoaded: false,
      fontFailed: true,
      habitsReady: true,
      failedToLoad: false,
    }),
    false,
  );
  assert.equal(resolveFontFamily(font.semibold, true), FALLBACK_FONT_FAMILY);
  assert.equal(resolveFontFamily(font.bold, false), font.bold);
  assert.notEqual(FALLBACK_FONT_FAMILY, font.regular);
});

test('the screen wires taps, reloads, undo, and the font gate through the shared helpers', () => {
  const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
  const row = readFileSync(join(__dirname, '..', 'src/components/HabitRow.tsx'), 'utf8');
  assert.match(app, /planTap\(/);
  assert.match(app, /publishReload\(/);
  assert.match(app, /restoreRemovedDate\(/);
  assert.match(app, /notebookCanOpen\(/);
  assert.match(app, /homeIsBlocked\(/);
  assert.match(app, /markLocalChange\(/);
  assert.match(app, /asOf=\{habit\.asOf\}/);
  assert.doesNotMatch(app, /if \(!fontsLoaded\)/);
  assert.match(row, /onToggle\(asOf\)/);
});
