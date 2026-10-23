import Database from 'better-sqlite3';
import path from 'path';

// Manual per-day vacation rates move from one user_settings column (applied to
// every year) to a table keyed by vacation year. Same SQL as
// VACATION_DAILY_RATES_TABLE_SQL in lib/vacation-rate.ts — inlined because the
// runner image ships scripts/ but not lib/. Keep the two in step.
const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS vacation_daily_rates (
  user_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  rate REAL NOT NULL,
  PRIMARY KEY (user_id, year)
);
`;

// The old column was only ever filled in from 2026 payslips.
const LEGACY_RATE_YEAR = 2026;

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v29 on: ${dbPath}`);

db.exec('PRAGMA journal_mode=WAL');
db.exec(TABLE_SQL);
console.log('  vacation_daily_rates ready');

const columns = (db.pragma('table_info(user_settings)') as { name: string }[]).map((c) => c.name);
if (columns.includes('vacation_daily_rate')) {
  db.transaction(() => {
    const moved = db
      .prepare(
        `INSERT OR IGNORE INTO vacation_daily_rates (user_id, year, rate)
         SELECT user_id, ?, vacation_daily_rate FROM user_settings WHERE vacation_daily_rate > 0`,
      )
      .run(LEGACY_RATE_YEAR).changes;
    db.prepare('UPDATE user_settings SET vacation_daily_rate = NULL WHERE vacation_daily_rate IS NOT NULL').run();
    console.log(`  moved ${moved} manual rate(s) to ${LEGACY_RATE_YEAR}`);
  })();
}

console.log('Migration v29 complete');
db.close();
