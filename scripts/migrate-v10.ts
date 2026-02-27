import Database from 'better-sqlite3';

const dbPath = process.argv[2];

if (!dbPath) {
  console.error('Usage: npx tsx scripts/migrate-v10.ts <dbpath>');
  process.exit(1);
}

const db = new Database(dbPath);

const userSettingsCols = db.pragma('table_info(user_settings)') as { name: string }[];
const userSettingsColNames = userSettingsCols.map((c) => c.name);

if (!userSettingsColNames.includes('departments')) {
  db.exec(`ALTER TABLE user_settings ADD COLUMN departments TEXT NOT NULL DEFAULT '[]'`);
  console.log('Added departments column to user_settings');
} else {
  console.log('departments already exists');
}

const timeEntriesCols = db.pragma('table_info(time_entries)') as { name: string }[];
const timeEntriesColNames = timeEntriesCols.map((c) => c.name);

if (!timeEntriesColNames.includes('task_segments')) {
  db.exec(`ALTER TABLE time_entries ADD COLUMN task_segments TEXT`);
  console.log('Added task_segments column to time_entries');
} else {
  console.log('task_segments already exists');
}

console.log('Migration v10 complete');
db.close();
