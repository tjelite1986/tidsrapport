import Database from 'better-sqlite3';
import path from 'path';

// Inlined on purpose: the runner image ships scripts/ but not lib/. Same as
// SYNC_ITEM_SEEN_COLUMNS in lib/schedule-sync/store.ts and
// NOTIFICATIONS_TABLE_SQL in lib/notifications/store.ts — keep them in step.
const ITEM_COLUMNS: { name: string; ddl: string }[] = [
  { name: 'seen_date', ddl: 'seen_date TEXT' },
  { name: 'seen_start', ddl: 'seen_start TEXT' },
  { name: 'seen_end', ddl: 'seen_end TEXT' },
  { name: 'seen_description', ddl: 'seen_description TEXT' },
  { name: 'first_date', ddl: 'first_date TEXT' },
  { name: 'first_start', ddl: 'first_start TEXT' },
  { name: 'first_end', ddl: 'first_end TEXT' },
  { name: 'gone', ddl: 'gone INTEGER NOT NULL DEFAULT 0' },
];

const NOTIFICATIONS_SQL = `
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  date TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id, read_at);
`;

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v27 on: ${dbPath}`);

db.exec('PRAGMA journal_mode=WAL');

db.exec(NOTIFICATIONS_SQL);
console.log('  notifications ready');

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schedule_sync_items'")
  .all() as { name: string }[];
if (tables.length === 0) {
  console.log('schedule_sync_items does not exist yet — run migration v26 first');
  db.close();
  process.exit(0);
}

// What the feed said on the last pass (to report changes) and when first seen (the original schedule)
const existing = new Set((db.pragma('table_info(schedule_sync_items)') as { name: string }[]).map((c) => c.name));
for (const column of ITEM_COLUMNS) {
  if (existing.has(column.name)) {
    console.log(`  ${column.name} already present`);
    continue;
  }
  db.exec(`ALTER TABLE schedule_sync_items ADD COLUMN ${column.ddl}`);
  console.log(`  + ${column.name}`);
}

// The best record of the original schedule for shifts seen before v27 is what the sync last wrote
const backfilled = db
  .prepare('UPDATE schedule_sync_items SET first_date = date, first_start = start_time, first_end = end_time WHERE first_date IS NULL')
  .run().changes;
console.log(`  first_* backfilled on ${backfilled} rows`);

console.log('Migration v27 complete');
db.close();
