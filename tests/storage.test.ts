import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { bestAfterUntick } from '../src/best';
import { fixedClock } from '../src/clock';
import { computeStreak } from '../src/streak';
import { SCHEMA, SQL } from '../src/storage/schema';

function openDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec(SCHEMA);
  return database;
}

test('tick inserts and untick deletes the same local day', () => {
  const database = openDatabase();
  database.prepare(SQL.insertHabit).run('habit-1', 'Drink water', '2026-10-15');
  database.prepare(SQL.insertCheckin).run('habit-1', '2026-10-15');
  database.prepare(SQL.insertCheckin).run('habit-1', '2026-10-16');
  database.prepare(SQL.insertCheckin).run('habit-1', '2026-10-17');
  database.prepare(SQL.insertCheckin).run('habit-1', '2026-10-17');

  const count = database.prepare('SELECT COUNT(*) AS count FROM checkins').get() as {
    count: number;
  };
  assert.equal(count.count, 3);

  const clock = fixedClock(new Date('2026-10-17T12:00:00Z'), 'UTC');
  const before = database
    .prepare(SQL.listCheckins)
    .all('habit-1')
    .map((row) => (row as { date: string }).date);
  assert.equal(computeStreak(before, clock).current, 3);

  database.prepare(SQL.deleteCheckin).run('habit-1', '2026-10-17');
  const after = database
    .prepare(SQL.listCheckins)
    .all('habit-1')
    .map((row) => (row as { date: string }).date);
  assert.deepEqual(after, ['2026-10-15', '2026-10-16']);
  assert.equal(computeStreak(after, clock).current, 2);

  database.prepare(SQL.raiseBest).run(3, 'habit-1', 3);
  database.prepare(SQL.raiseBest).run(1, 'habit-1', 1);
  const best = database.prepare(SQL.readBest).get('habit-1') as { best: number };
  assert.equal(best.best, 3);
  assert.equal(bestAfterUntick(best.best), 3);
  database.close();
});

test('check-in primary key is (habitId, date)', () => {
  const database = openDatabase();
  const columns = database.prepare('PRAGMA table_info(checkins)').all() as {
    name: string;
    pk: number;
  }[];
  const primary = columns
    .filter((column) => column.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);
  assert.deepEqual(primary, ['habitId', 'date']);
  database.close();
});
