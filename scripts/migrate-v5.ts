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

console.log('Starting v5 migration...');

const cols = sqlite.prepare("PRAGMA table_info(vacation_pay_withdrawals)").all() as { name: string }[];
const existingCols = new Set(cols.map((c) => c.name));

const alterStatements: [string, string][] = [
  ['tax', "ALTER TABLE vacation_pay_withdrawals ADD COLUMN tax REAL NOT NULL DEFAULT 0"],
  ['net_amount', "ALTER TABLE vacation_pay_withdrawals ADD COLUMN net_amount REAL NOT NULL DEFAULT 0"],
];

for (const [col, sql] of alterStatements) {
  if (!existingCols.has(col)) {
    console.log(`  Adding column: ${col}`);
    sqlite.exec(sql);
  } else {
    console.log(`  Column ${col} already exists, skipping`);
  }
}

console.log('v5 migration completed successfully!');
sqlite.close();
