import Database from 'better-sqlite3';
import path from 'path';

// The column list is inlined on purpose: the runner image ships scripts/ but
// not lib/, so importing it from lib/db/settings-columns.ts makes this script
// unrunnable in the container. Keep the two copies in step.
const EXTRA_COLUMNS: { name: string; ddl: string }[] = [
  { name: 'schedule_sync_enabled', ddl: 'schedule_sync_enabled INTEGER NOT NULL DEFAULT 0' },
  { name: 'schedule_sync_project_id', ddl: 'schedule_sync_project_id INTEGER' },
  { name: 'schedule_synced_at', ddl: 'schedule_synced_at TEXT' },
  { name: 'schedule_sync_status', ddl: 'schedule_sync_status TEXT' },
];

// Same as SCHEDULE_SYNC_ITEMS_SQL in lib/schedule-sync/store.ts
const ITEMS_SQL = `
CREATE TABLE IF NOT EXISTS schedule_sync_items (
  user_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  description TEXT,
  entry_id INTEGER,
  PRIMARY KEY (user_id, uid)
)`;

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v26 on: ${dbPath}`);

db.exec('PRAGMA journal_mode=WAL');

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_settings'")
  .all() as { name: string }[];
if (tables.length === 0) {
  console.log('user_settings table does not exist yet — run the earlier migrations first');
  db.close();
  process.exit(0);
}

// Automatic schedule sync: settings columns and the table of seen feed shifts. Idempotent: every column is
// checked against PRAGMA table_info before the ALTER.
const existing = new Set((db.pragma('table_info(user_settings)') as { name: string }[]).map((c) => c.name));
for (const column of EXTRA_COLUMNS) {
  if (existing.has(column.name)) {
    console.log(`  ${column.name} already present`);
    continue;
  }
  db.exec(`ALTER TABLE user_settings ADD COLUMN ${column.ddl}`);
  console.log(`  + ${column.name}`);
}

db.exec(ITEMS_SQL);
console.log('  schedule_sync_items ready');

const cols = (db.pragma('table_info(user_settings)') as { name: string }[]).map((c) => c.name);
console.log(`user_settings columns: ${cols.join(', ')}`);

console.log('Migration v26 complete');
db.close();
