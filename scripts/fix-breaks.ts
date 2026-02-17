import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.argv[2] || path.join(process.cwd(), 'data', 'tidsrapport.db');
const userId = parseInt(process.argv[3] || '3');

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

console.log(`Fixing break_minutes for user ${userId} in ${dbPath}...`);

const entries = sqlite.prepare('SELECT id, date, start_time, end_time, hours, break_minutes FROM time_entries WHERE user_id = ?').all(userId) as any[];

let fixed = 0;
const update = sqlite.prepare('UPDATE time_entries SET break_minutes = ? WHERE id = ?');

const tx = sqlite.transaction(() => {
  for (const e of entries) {
    if (!e.start_time || !e.end_time) continue;
    const [sh, sm] = e.start_time.split(':').map(Number);
    const [eh, em] = e.end_time.split(':').map(Number);
    const totalMin = (eh * 60 + em) - (sh * 60 + sm);
    const workedMin = Math.round(e.hours * 60);
    const breakMin = totalMin - workedMin;

    if (breakMin >= 0 && breakMin !== e.break_minutes) {
      console.log(`  ${e.date} ${e.start_time}-${e.end_time}: ${e.hours}h, rast ${e.break_minutes} -> ${breakMin} min`);
      update.run(breakMin, e.id);
      fixed++;
    }
  }
});
tx();

console.log(`Fixed ${fixed} of ${entries.length} entries`);
sqlite.close();
