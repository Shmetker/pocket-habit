import * as SQLite from 'expo-sqlite';

import type { Clock } from '../clock';
import { bestAtAppOpen } from '../best';
import { buildHabitView, type HabitView } from '../habit';
import { isLocalDate } from '../dates';
import { SCHEMA, SQL } from './schema';

export type HabitRecord = {
  id: string;
  name: string;
  createdAt: string;
  best: number;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('pocket-habit.db').then(async (database) => {
      await database.execAsync('PRAGMA foreign_keys = ON;');
      await database.execAsync(SCHEMA);
      return database;
    });
  }
  return databasePromise;
}

export async function addHabit(input: {
  id: string;
  name: string;
  createdAt: string;
}): Promise<void> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Habit name is empty');
  }
  if (!isLocalDate(input.createdAt)) {
    throw new Error('createdAt must be a local YYYY-MM-DD date');
  }
  const database = await getDatabase();
  await database.runAsync(SQL.insertHabit, input.id, name, input.createdAt);
}

export async function listHabits(): Promise<HabitRecord[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<HabitRecord>(SQL.listHabits);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    best: Number(row.best) || 0,
  }));
}

export async function tick(habitId: string, date: string): Promise<void> {
  if (!isLocalDate(date)) {
    throw new Error('Check-in date must be a local YYYY-MM-DD date');
  }
  const database = await getDatabase();
  await database.runAsync(SQL.insertCheckin, habitId, date);
}

export async function untick(habitId: string, date: string): Promise<void> {
  if (!isLocalDate(date)) {
    throw new Error('Check-in date must be a local YYYY-MM-DD date');
  }
  const database = await getDatabase();
  await database.runAsync(SQL.deleteCheckin, habitId, date);
}

export async function listCheckins(habitId: string): Promise<string[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ date: string }>(SQL.listCheckins, habitId);
  return rows.map((row) => row.date);
}

/** Raises Best when next is higher. A lower value is a no-op. */
export async function raiseBest(habitId: string, next: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(SQL.raiseBest, next, habitId, next);
}

export async function loadHabitViews(clock: Clock): Promise<HabitView[]> {
  const records = await listHabits();
  const views: HabitView[] = [];
  for (const record of records) {
    const dates = await listCheckins(record.id);
    const best = bestAtAppOpen(record.best, dates, clock);
    if (best > record.best) {
      await raiseBest(record.id, best);
    }
    views.push(buildHabitView({ ...record, best }, dates, clock));
  }
  return views;
}
