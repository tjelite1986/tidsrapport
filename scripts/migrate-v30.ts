import Database from 'better-sqlite3';
import path from 'path';

// The column list is inlined on purpose: the runner image ships scripts/ but
// not lib/, so importing it from lib/db/time-entry-columns.ts makes this script
// unrunnable in the container. Keep the two copies in step.
const EXTRA_COLUMNS: { name: string; ddl: string }[] = [
  { name: 'hourly_rate_override', ddl: 'hourly_rate_override REAL' },
];

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v30 on: ${dbPath}`);

db.exec('PRAGMA journal_mode=WAL');

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='time_entries'")
  .all() as { name: string }[];
if (tables.length === 0) {
  console.log('time_entries table does not exist yet — run the earlier migrations first');
  db.close();
  process.exit(0);
}

// Per-shift hourly rate. Idempotent: every column is checked against
// PRAGMA table_info before the ALTER.
const existing = new Set((db.pragma('table_info(time_entries)') as { name: string }[]).map((c) => c.name));
for (const column of EXTRA_COLUMNS) {
  if (existing.has(column.name)) {
    console.log(`  ${column.name} already present`);
    continue;
  }
  db.exec(`ALTER TABLE time_entries ADD COLUMN ${column.ddl}`);
  console.log(`  + ${column.name}`);
}

const cols = (db.pragma('table_info(time_entries)') as { name: string }[]).map((c) => c.name);
console.log(`time_entries columns: ${cols.join(', ')}`);

db.close();
