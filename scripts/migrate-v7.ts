import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.argv[2] || path.join(process.cwd(), 'data', 'tidsrapport.db');
const db = new Database(dbPath);

console.log(`Kör migration v7 på: ${dbPath}`);

// Lägg till week_type i weekly_schedule
const schedCols = db.prepare("PRAGMA table_info(weekly_schedule)").all() as { name: string }[];
if (!schedCols.find((c) => c.name === 'week_type')) {
  db.prepare("ALTER TABLE weekly_schedule ADD COLUMN week_type INTEGER NOT NULL DEFAULT 0").run();
  console.log('Lade till kolumn: weekly_schedule.week_type');
} else {
  console.log('Kolumn weekly_schedule.week_type finns redan — hoppar över.');
}

// Lägg till schedule_reference_date i user_settings
const settingsCols = db.prepare("PRAGMA table_info(user_settings)").all() as { name: string }[];
if (!settingsCols.find((c) => c.name === 'schedule_reference_date')) {
  db.prepare("ALTER TABLE user_settings ADD COLUMN schedule_reference_date TEXT").run();
  console.log('Lade till kolumn: user_settings.schedule_reference_date');
} else {
  console.log('Kolumn user_settings.schedule_reference_date finns redan — hoppar över.');
}

console.log('Migration v7 klar!');
db.close();
