import Database from 'better-sqlite3';

const dbPath = process.argv[2];

if (!dbPath) {
  console.error('Usage: npx tsx scripts/migrate-v12.ts <dbpath>');
  process.exit(1);
}

const db = new Database(dbPath);

const cols = db.pragma('table_info(user_settings)') as { name: string }[];
const colNames = cols.map((c) => c.name);

if (!colNames.includes('auto_break_rules')) {
  db.exec(`ALTER TABLE user_settings ADD COLUMN auto_break_rules TEXT`);
  console.log('Added auto_break_rules column to user_settings');
} else {
  console.log('auto_break_rules already exists');
}

console.log('Migration v12 done');
