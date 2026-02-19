import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.argv[2] || path.join(process.cwd(), 'data', 'tidsrapport.db');
const db = new Database(dbPath);

console.log(`Kör migration v6 på: ${dbPath}`);

// Skapa vacation_pay_inclusions-tabell
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vacation_pay_inclusions'").get();

if (!tables) {
  db.prepare(`
    CREATE TABLE vacation_pay_inclusions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      include_in_salary INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, month)
    )
  `).run();
  console.log('Skapade tabell: vacation_pay_inclusions');
} else {
  console.log('Tabell vacation_pay_inclusions finns redan — hoppar över.');
}

console.log('Migration v6 klar!');
db.close();
