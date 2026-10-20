import Database from 'better-sqlite3';
import path from 'path';

// Personal calendar events. The SQL is inlined on purpose: the runner image
// ships scripts/ but not lib/. Keep it in step with CALENDAR_EVENTS_TABLE_SQL in
// lib/calendar-events/store.ts, which also creates the table at runtime, so
// running this by hand is optional.
const CALENDAR_EVENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  title TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date ON calendar_events (user_id, date);
`;

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v22 on: ${dbPath}`);

db.exec('PRAGMA journal_mode=WAL');
db.exec(CALENDAR_EVENTS_TABLE_SQL);

console.log('Migration v22 complete');
db.close();
