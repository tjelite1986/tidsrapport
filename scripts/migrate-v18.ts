import Database from 'better-sqlite3';
import path from 'path';

// The column list is inlined on purpose: the runner image ships scripts/ but
// not lib/, so importing it from lib/payslips/table.ts makes this script
// unrunnable in the container. Keep the two copies in step.
const EXTRA_COLUMNS: { name: string; ddl: string }[] = [
  { name: 'work_hours', ddl: 'work_hours REAL' },
  { name: 'hourly_rate', ddl: 'hourly_rate REAL' },
  { name: 'base_pay', ddl: 'base_pay REAL' },
  { name: 'ob_lines', ddl: 'ob_lines TEXT' },
  { name: 'total_ob', ddl: 'total_ob REAL' },
  { name: 'overtime_mertid', ddl: 'overtime_mertid REAL' },
  { name: 'overtime_enkel', ddl: 'overtime_enkel REAL' },
  { name: 'overtime_kvalificerad', ddl: 'overtime_kvalificerad REAL' },
  { name: 'sick_pay', ddl: 'sick_pay REAL' },
  { name: 'vacation_pay', ddl: 'vacation_pay REAL' },
  { name: 'vacation_days_pay', ddl: 'vacation_days_pay REAL' },
  { name: 'vacation_days_count', ddl: 'vacation_days_count REAL' },
];

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v18 on: ${dbPath}`);

db.exec('PRAGMA journal_mode=WAL');

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payslips'")
  .all() as { name: string }[];
if (tables.length === 0) {
  console.log('payslips table does not exist yet — run migrate-v17 first (or just start the app)');
  db.close();
  process.exit(0);
}

// Payslip line items beyond gross/tax/net, so an uploaded spec can be compared
// line by line against the app's own calculation. Idempotent: every column is
// checked against PRAGMA table_info before the ALTER.
const existing = new Set((db.pragma('table_info(payslips)') as { name: string }[]).map((c) => c.name));
for (const column of EXTRA_COLUMNS) {
  if (existing.has(column.name)) {
    console.log(`  ${column.name} already present`);
    continue;
  }
  db.exec(`ALTER TABLE payslips ADD COLUMN ${column.ddl}`);
  console.log(`  + ${column.name}`);
}

const cols = (db.pragma('table_info(payslips)') as { name: string }[]).map((c) => c.name);
console.log(`payslips columns: ${cols.join(', ')}`);

console.log('Migration v18 complete');
db.close();
