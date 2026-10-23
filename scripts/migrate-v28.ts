import Database from 'better-sqlite3';
import path from 'path';

// Same as the v28 lines in lib/notifications/store.ts — inlined because the runner image ships scripts/ but not lib/.
const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v28 on: ${dbPath}`);

db.exec('PRAGMA journal_mode=WAL');

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'")
  .all() as { name: string }[];
if (tables.length === 0) {
  console.log('notifications does not exist yet — run migration v27 first');
  db.close();
  process.exit(0);
}

const existing = new Set((db.pragma('table_info(notifications)') as { name: string }[]).map((c) => c.name));
if (existing.has('ref')) {
  console.log('  ref already present');
} else {
  db.exec('ALTER TABLE notifications ADD COLUMN ref TEXT');
  console.log('  + ref');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_ref ON notifications (user_id, ref) WHERE ref IS NOT NULL');
console.log('  idx_notifications_ref ready');

console.log('Migration v28 complete');
db.close();
