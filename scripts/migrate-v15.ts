import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v15 on: ${dbPath}`);

db.exec('PRAGMA journal_mode=WAL');

// Add hourly_rate_history column to user_settings if missing.
// Stores a JSON array of date-effective hourly rates:
//   [{ effectiveFrom: 'YYYY-MM-DD', hourlyRate: number, note?: string }]
// When non-empty it overrides customHourlyRate per entry date, so union raises
// and seniority steps that take effect mid-period are paid correctly.
const cols = (db.pragma('table_info(user_settings)') as { name: string }[]).map((c) => c.name);

if (!cols.includes('hourly_rate_history')) {
  db.exec("ALTER TABLE user_settings ADD COLUMN hourly_rate_history TEXT NOT NULL DEFAULT '[]'");
  console.log('Added column: hourly_rate_history to user_settings');
} else {
  console.log('hourly_rate_history already exists, skipping');
}

console.log('Migration v15 complete');
db.close();
