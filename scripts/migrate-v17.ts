import Database from 'better-sqlite3';
import path from 'path';

// The DDL is inlined on purpose: the runner image ships scripts/ but not lib/,
// so importing it from lib/payslips/table.ts makes this script unrunnable in
// the container. Keep the two copies in step.
const PAYSLIPS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS payslips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    pay_month TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    gross_pay REAL,
    tax REAL,
    net_pay REAL,
    note TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS payslips_user_month_idx ON payslips(user_id, pay_month);
`;

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v17 on: ${dbPath}`);

db.exec('PRAGMA journal_mode=WAL');

// Payslips uploaded from the employer: metadata in SQLite, the file itself on
// disk under data/payslips/<userId>/. Idempotent — CREATE TABLE IF NOT EXISTS.
db.exec(PAYSLIPS_TABLE_SQL);

const cols = (db.pragma('table_info(payslips)') as { name: string }[]).map((c) => c.name);
console.log(`payslips columns: ${cols.join(', ')}`);

console.log('Migration v17 complete');
db.close();
