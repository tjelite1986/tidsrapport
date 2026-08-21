import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { applyUserSettingsColumns } from './settings-columns';
import path from 'path';
import fs from 'fs';

const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'tidsrapport.db');
export const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// v19 payslip header/footer columns are applied here as well as in
// scripts/migrate-v19.ts, so a deploy works before anyone runs the migration by
// hand. Every read of user_settings selects them, so this has to run before the
// first query rather than on first use.
applyUserSettingsColumns(sqlite);

export const db = drizzle(sqlite, { schema });
