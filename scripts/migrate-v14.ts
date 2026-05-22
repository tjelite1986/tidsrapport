import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v14 on: ${dbPath}`);

db.exec('PRAGMA journal_mode=WAL');

// Add user_id ownership column to projects (was previously a shared global table).
const projectCols = db.pragma('table_info(projects)') as { name: string }[];
const projectColNames = projectCols.map((c) => c.name);

if (!projectColNames.includes('user_id')) {
  db.exec('ALTER TABLE projects ADD COLUMN user_id INTEGER REFERENCES users(id)');
  console.log('Added column: user_id to projects');

  // Backfill: pick the user with the most time-entries against each project.
  // Fallback: first admin. Last resort: lowest user id.
  const projects = db.prepare('SELECT id FROM projects WHERE user_id IS NULL').all() as { id: number }[];
  const fallbackAdmin = db
    .prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1")
    .get() as { id: number } | undefined;
  const fallbackAny = db.prepare('SELECT MIN(id) AS id FROM users').get() as { id: number | null };
  const defaultOwner = fallbackAdmin?.id ?? fallbackAny.id;

  if (defaultOwner == null) {
    throw new Error('No users in DB - cannot backfill projects.user_id');
  }

  const findTopUser = db.prepare(
    `SELECT user_id AS id
       FROM time_entries
      WHERE project_id = ?
      GROUP BY user_id
      ORDER BY COUNT(*) DESC
      LIMIT 1`,
  );
  const setOwner = db.prepare('UPDATE projects SET user_id = ? WHERE id = ?');

  for (const p of projects) {
    const top = findTopUser.get(p.id) as { id: number } | undefined;
    const ownerId = top?.id ?? defaultOwner;
    setOwner.run(ownerId, p.id);
    console.log(`  project ${p.id} -> user ${ownerId}${top ? ' (most time-entries)' : ' (fallback)'}`);
  }

  console.log(`Backfilled ${projects.length} project(s)`);
} else {
  console.log('user_id already exists on projects, skipping');
}

console.log('Migration v14 complete');
db.close();
