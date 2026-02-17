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

console.log('Starting v4 migration...');

const settingsCols = sqlite.prepare("PRAGMA table_info(user_settings)").all() as { name: string }[];
const existingCols = new Set(settingsCols.map((c) => c.name));

const alterStatements: [string, string][] = [
  ['tax_mode', "ALTER TABLE user_settings ADD COLUMN tax_mode TEXT NOT NULL DEFAULT 'percentage'"],
  ['tax_table', "ALTER TABLE user_settings ADD COLUMN tax_table INTEGER"],
  ['municipality', "ALTER TABLE user_settings ADD COLUMN municipality TEXT"],
];

for (const [col, sql] of alterStatements) {
  if (!existingCols.has(col)) {
    console.log(`  Adding column: ${col}`);
    sqlite.exec(sql);
  } else {
    console.log(`  Column ${col} already exists, skipping`);
  }
}

console.log('v4 migration completed successfully!');
sqlite.close();
