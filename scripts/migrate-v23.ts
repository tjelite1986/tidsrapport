import Database from 'better-sqlite3';
import path from 'path';

// Recurring calendar events. Self-contained on purpose: the runner image ships
// scripts/ but not lib/. lib/calendar-events/store.ts adds the same columns at
// runtime, so running this by hand is optional.
const COLUMNS: { name: string; ddl: string }[] = [
  { name: 'recurrence', ddl: "recurrence TEXT NOT NULL DEFAULT 'none'" },
  { name: 'recurrence_until', ddl: 'recurrence_until TEXT' },
  { name: 'excluded_dates', ddl: "excluded_dates TEXT NOT NULL DEFAULT '[]'" },
];

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v23 on: ${dbPath}`);

const info = db.pragma('table_info(calendar_events)') as { name: string }[];
if (info.length === 0) {
  console.log('calendar_events does not exist yet; run migrate-v22 first');
} else {
  const existing = new Set(info.map((c) => c.name));
  for (const column of COLUMNS) {
    if (existing.has(column.name)) continue;
    db.exec(`ALTER TABLE calendar_events ADD COLUMN ${column.ddl}`);
    console.log(`Added calendar_events.${column.name}`);
  }
}

console.log('Migration v23 complete');
db.close();
