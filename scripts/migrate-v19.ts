import Database from 'better-sqlite3';
import path from 'path';

// The column list is inlined on purpose: the runner image ships scripts/ but
// not lib/, so importing it from lib/db/settings-columns.ts makes this script
// unrunnable in the container. Keep the two copies in step.
const EXTRA_COLUMNS: { name: string; ddl: string }[] = [
  { name: 'employee_number', ddl: 'employee_number TEXT' },
  { name: 'employer_org_number', ddl: 'employer_org_number TEXT' },
  { name: 'employer_address', ddl: 'employer_address TEXT' },
  { name: 'employer_zip_city', ddl: 'employer_zip_city TEXT' },
  { name: 'employee_address', ddl: 'employee_address TEXT' },
  { name: 'employee_zip_city', ddl: 'employee_zip_city TEXT' },
  { name: 'bank_account', ddl: 'bank_account TEXT' },
  { name: 'payday_day', ddl: 'payday_day INTEGER NOT NULL DEFAULT 25' },
  { name: 'payslip_message', ddl: 'payslip_message TEXT' },
  { name: 'employer_fee_rate', ddl: 'employer_fee_rate REAL NOT NULL DEFAULT 31.42' },
];

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v19 on: ${dbPath}`);

db.exec('PRAGMA journal_mode=WAL');

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_settings'")
  .all() as { name: string }[];
if (tables.length === 0) {
  console.log('user_settings table does not exist yet — run the earlier migrations first');
  db.close();
  process.exit(0);
}

// Header and footer data for the generated payslip. Idempotent: every column is
// checked against PRAGMA table_info before the ALTER.
const existing = new Set((db.pragma('table_info(user_settings)') as { name: string }[]).map((c) => c.name));
for (const column of EXTRA_COLUMNS) {
  if (existing.has(column.name)) {
    console.log(`  ${column.name} already present`);
    continue;
  }
  db.exec(`ALTER TABLE user_settings ADD COLUMN ${column.ddl}`);
  console.log(`  + ${column.name}`);
}

const cols = (db.pragma('table_info(user_settings)') as { name: string }[]).map((c) => c.name);
console.log(`user_settings columns: ${cols.join(', ')}`);

console.log('Migration v19 complete');
db.close();
