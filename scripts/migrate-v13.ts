import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v13 on: ${dbPath}`);

db.exec('PRAGMA journal_mode=WAL');

// Skapa vacation_days-tabellen om den inte finns
const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='vacation_days'"
).all();

if (tables.length === 0) {
  db.exec(`
    CREATE TABLE vacation_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      date TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, date)
    )
  `);
  console.log('Created table: vacation_days');
} else {
  console.log('vacation_days already exists, skipping');
}

// Lägg till vacation_days_per_year i user_settings om den saknas
const userSettingsCols = db.pragma('table_info(user_settings)') as { name: string }[];
const colNames = userSettingsCols.map((c) => c.name);

if (!colNames.includes('vacation_days_per_year')) {
  db.exec(
    'ALTER TABLE user_settings ADD COLUMN vacation_days_per_year INTEGER NOT NULL DEFAULT 25'
  );
  console.log('Added column: vacation_days_per_year to user_settings');
} else {
  console.log('vacation_days_per_year already exists, skipping');
}

console.log('Migration v13 complete');
db.close();
