/**
 * habits.best is stored beside the spec columns (id, name, createdAt) so Best
 * can be raised after a tick and kept after an untick. The SQL guard
 * `best < ?` refuses a lower write.
 *
 * checkins primary key is (habitId, date). A tick inserts; an untick deletes.
 * Dates are local YYYY-MM-DD strings.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  best INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS checkins (
  habitId TEXT NOT NULL,
  date TEXT NOT NULL,
  PRIMARY KEY (habitId, date),
  FOREIGN KEY (habitId) REFERENCES habits(id) ON DELETE CASCADE
);
`;

export const SQL = {
  insertHabit: 'INSERT INTO habits (id, name, createdAt, best) VALUES (?, ?, ?, 0)',
  listHabits: 'SELECT id, name, createdAt, best FROM habits ORDER BY createdAt ASC, id ASC',
  insertCheckin:
    'INSERT INTO checkins (habitId, date) VALUES (?, ?) ON CONFLICT (habitId, date) DO NOTHING',
  deleteCheckin: 'DELETE FROM checkins WHERE habitId = ? AND date = ?',
  listCheckins: 'SELECT date FROM checkins WHERE habitId = ? ORDER BY date ASC',
  raiseBest: 'UPDATE habits SET best = ? WHERE id = ? AND best < ?',
  readBest: 'SELECT best FROM habits WHERE id = ?',
} as const;
