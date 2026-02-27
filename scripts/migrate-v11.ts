import Database from 'better-sqlite3';

const dbPath = process.argv[2];

if (!dbPath) {
  console.error('Usage: npx tsx scripts/migrate-v11.ts <dbpath>');
  process.exit(1);
}

const db = new Database(dbPath);

const timeEntriesCols = db.pragma('table_info(time_entries)') as { name: string }[];
const timeEntriesColNames = timeEntriesCols.map((c) => c.name);

if (!timeEntriesColNames.includes('break_periods')) {
  db.exec(`ALTER TABLE time_entries ADD COLUMN break_periods TEXT`);
  console.log('Added break_periods column to time_entries');
} else {
  console.log('break_periods already exists');
}

console.log('Migration v11 complete');
db.close();
