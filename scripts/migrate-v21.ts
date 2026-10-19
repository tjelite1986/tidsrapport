import Database from 'better-sqlite3';
import path from 'path';

// Direct messages between users. The SQL is inlined on purpose: the runner
// image ships scripts/ but not lib/. Keep it in step with MESSAGES_TABLE_SQL in
// lib/messages/store.ts, which also creates the table at runtime, so running
// this by hand is optional.
const MESSAGES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  recipient_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages (sender_id, recipient_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (recipient_id, read_at);
`;

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v21 on: ${dbPath}`);

db.exec('PRAGMA journal_mode=WAL');
db.exec(MESSAGES_TABLE_SQL);

console.log('Migration v21 complete');
db.close();
