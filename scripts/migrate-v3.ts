import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'tidsrapport.db');
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

console.log('Starting v3 migration...');

// Add new columns to user_settings
const settingsCols = sqlite.prepare("PRAGMA table_info(user_settings)").all() as { name: string }[];
const existingCols = new Set(settingsCols.map((c) => c.name));

const alterStatements: [string, string][] = [
  ['employee_name', "ALTER TABLE user_settings ADD COLUMN employee_name TEXT"],
  ['employer_name', "ALTER TABLE user_settings ADD COLUMN employer_name TEXT"],
  ['default_start_time', "ALTER TABLE user_settings ADD COLUMN default_start_time TEXT"],
  ['default_end_time', "ALTER TABLE user_settings ADD COLUMN default_end_time TEXT"],
  ['calendar_view_default', "ALTER TABLE user_settings ADD COLUMN calendar_view_default TEXT NOT NULL DEFAULT 'week'"],
];

for (const [col, sql] of alterStatements) {
  if (!existingCols.has(col)) {
    console.log(`  Adding column: ${col}`);
    sqlite.exec(sql);
  } else {
    console.log(`  Column ${col} already exists, skipping`);
  }
}

// Create vacation_pay_withdrawals table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS vacation_pay_withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount REAL NOT NULL,
    note TEXT,
    withdrawn_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

console.log('Created vacation_pay_withdrawals table (if not existing)');
console.log('v3 migration completed successfully!');
sqlite.close();
