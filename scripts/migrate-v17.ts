import Database from 'better-sqlite3';
import path from 'path';
import { PAYSLIPS_TABLE_SQL } from '../lib/payslips/table';

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
