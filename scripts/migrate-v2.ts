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

console.log('Starting v2 migration...');

// Check if columns already exist before adding
const timeEntryCols = sqlite.prepare("PRAGMA table_info(time_entries)").all() as { name: string }[];
const existingCols = new Set(timeEntryCols.map((c) => c.name));

const alterStatements: [string, string][] = [
  ['start_time', "ALTER TABLE time_entries ADD COLUMN start_time TEXT"],
  ['end_time', "ALTER TABLE time_entries ADD COLUMN end_time TEXT"],
  ['break_minutes', "ALTER TABLE time_entries ADD COLUMN break_minutes INTEGER DEFAULT 0"],
  ['entry_type', "ALTER TABLE time_entries ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'work'"],
  ['overtime_type', "ALTER TABLE time_entries ADD COLUMN overtime_type TEXT NOT NULL DEFAULT 'none'"],
];

for (const [col, sql] of alterStatements) {
  if (!existingCols.has(col)) {
    console.log(`  Adding column: ${col}`);
    sqlite.exec(sql);
  } else {
    console.log(`  Column ${col} already exists, skipping`);
  }
}

// Create new tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    workplace_type TEXT NOT NULL DEFAULT 'none',
    contract_level TEXT NOT NULL DEFAULT '3plus',
    tax_rate REAL NOT NULL DEFAULT 30,
    vacation_pay_rate REAL NOT NULL DEFAULT 12,
    vacation_pay_mode TEXT NOT NULL DEFAULT 'included',
    working_hours_per_month REAL NOT NULL DEFAULT 160,
    auto_break_calc INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS work_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    break_minutes INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS weekly_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    day_of_week INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    break_minutes INTEGER NOT NULL DEFAULT 0
  );
`);

console.log('Created new tables (if not existing)');

// Migrate salary_settings -> user_settings
const salaryRows = sqlite.prepare("SELECT * FROM salary_settings").all() as { user_id: number; working_hours_per_month: number }[];
const insertSettings = sqlite.prepare(`
  INSERT OR IGNORE INTO user_settings (user_id, working_hours_per_month)
  VALUES (?, ?)
`);

for (const row of salaryRows) {
  insertSettings.run(row.user_id, row.working_hours_per_month);
  console.log(`  Migrated settings for user ${row.user_id}`);
}

console.log('v2 migration completed successfully!');
sqlite.close();
