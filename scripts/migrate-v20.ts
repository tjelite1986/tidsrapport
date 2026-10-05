import Database from 'better-sqlite3';
import path from 'path';

// Sick and karens hours on payslips. The column list is inlined on purpose:
// the runner image ships scripts/ but not lib/. Keep it in step with
// PAYSLIP_EXTRA_COLUMNS in lib/payslips/table.ts, which also applies these
// columns at runtime, so running this by hand is optional.
const EXTRA_COLUMNS: { name: string; ddl: string }[] = [
  { name: 'sick_hours', ddl: 'sick_hours REAL' },
  { name: 'karens_hours', ddl: 'karens_hours REAL' },
];

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v20 on: ${dbPath}`);

db.exec('PRAGMA journal_mode=WAL');

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payslips'")
  .all() as { name: string }[];
if (tables.length === 0) {
  console.log('payslips table does not exist yet — run the earlier migrations first');
  db.close();
  process.exit(0);
}

const existing = new Set((db.pragma('table_info(payslips)') as { name: string }[]).map((c) => c.name));
for (const column of EXTRA_COLUMNS) {
  if (existing.has(column.name)) {
    console.log(`  ${column.name} already present`);
    continue;
  }
  db.exec(`ALTER TABLE payslips ADD COLUMN ${column.ddl}`);
  console.log(`  + ${column.name}`);
}

console.log('Migration v20 complete');
db.close();
