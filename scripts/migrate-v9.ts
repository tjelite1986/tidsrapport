import Database from 'better-sqlite3';

const dbPath = process.argv[2];

if (!dbPath) {
  console.error('Usage: npx tsx scripts/migrate-v9.ts <dbpath>');
  process.exit(1);
}

const db = new Database(dbPath);

const columns = db.pragma('table_info(user_settings)') as { name: string }[];
const colNames = columns.map((c) => c.name);

if (!colNames.includes('salary_mode')) {
  db.exec(`ALTER TABLE user_settings ADD COLUMN salary_mode TEXT NOT NULL DEFAULT 'contract'`);
  console.log('Added salary_mode column');
} else {
  console.log('salary_mode already exists');
}

if (!colNames.includes('custom_hourly_rate')) {
  db.exec(`ALTER TABLE user_settings ADD COLUMN custom_hourly_rate REAL`);
  console.log('Added custom_hourly_rate column');
} else {
  console.log('custom_hourly_rate already exists');
}

if (!colNames.includes('fixed_monthly_salary')) {
  db.exec(`ALTER TABLE user_settings ADD COLUMN fixed_monthly_salary REAL`);
  console.log('Added fixed_monthly_salary column');
} else {
  console.log('fixed_monthly_salary already exists');
}

console.log('Migration v9 complete');
db.close();
