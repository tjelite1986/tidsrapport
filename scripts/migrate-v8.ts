import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.argv[2] || path.join(process.cwd(), 'data', 'tidsrapport.db');
const db = new Database(dbPath);

console.log(`Kör migration v8 på: ${dbPath}`);

// Lägg till schedule_week_count i user_settings
const settingsCols = db.prepare("PRAGMA table_info(user_settings)").all() as { name: string }[];
if (!settingsCols.find((c) => c.name === 'schedule_week_count')) {
  db.prepare("ALTER TABLE user_settings ADD COLUMN schedule_week_count INTEGER NOT NULL DEFAULT 2").run();
  console.log('Lade till kolumn: user_settings.schedule_week_count');
} else {
  console.log('Kolumn user_settings.schedule_week_count finns redan — hoppar över.');
}

console.log('Migration v8 klar!');
db.close();
