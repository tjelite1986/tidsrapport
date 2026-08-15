import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v16 on: ${dbPath}`);

db.exec('PRAGMA journal_mode=WAL');

// Add vacation_daily_rate to user_settings if missing.
// Manual override for the per-day vacation pay ("A-pris" on the payslip line
// "611 Semesterlön betald"). NULL keeps the derived rate (previous calendar
// year's vacation-pay pot / vacation_days_per_year), which is only correct once
// a full year of time entries exists.
const cols = (db.pragma('table_info(user_settings)') as { name: string }[]).map((c) => c.name);

if (!cols.includes('vacation_daily_rate')) {
  db.exec('ALTER TABLE user_settings ADD COLUMN vacation_daily_rate REAL');
  console.log('Added column: vacation_daily_rate to user_settings');
} else {
  console.log('vacation_daily_rate already exists, skipping');
}

console.log('Migration v16 complete');
db.close();
