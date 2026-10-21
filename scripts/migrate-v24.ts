import Database from 'better-sqlite3';
import path from 'path';

// Every user gets their own projects. v14 gave each project an owner, but time
// entries logged before that still point at another user's project, and users
// created since then start with no project at all. This migration:
//  1. gives each user who logs time on someone else's project their own copy
//     of it and moves their entries there;
//  2. gives every user who still has no project a default one.
// Self-contained on purpose: the runner image ships scripts/ but not lib/.
const DEFAULT_PROJECT_NAME = 'Arbete';

const dbPath = process.argv[2] || path.join(process.cwd(), 'data/tidsrapport.db');
const db = new Database(dbPath);

console.log(`Running migration v24 on: ${dbPath}`);

const columns = db.pragma('table_info(projects)') as { name: string }[];
if (!columns.some((c) => c.name === 'user_id')) {
  console.log('projects.user_id does not exist yet; run migrate-v14 first');
  db.close();
  process.exit(1);
}

const crossOwned = db
  .prepare(
    `SELECT t.user_id AS userId, p.id AS projectId, p.name, p.description, p.active, COUNT(*) AS n
     FROM time_entries t JOIN projects p ON p.id = t.project_id
     WHERE t.user_id <> p.user_id
     GROUP BY t.user_id, p.id`,
  )
  .all() as { userId: number; projectId: number; name: string; description: string | null; active: number; n: number }[];

const findOwn = db.prepare('SELECT id FROM projects WHERE user_id = ? AND name = ?');
const insertProject = db.prepare(
  'INSERT INTO projects (user_id, name, description, active) VALUES (?, ?, ?, ?) RETURNING id',
);
const moveEntries = db.prepare('UPDATE time_entries SET project_id = ? WHERE user_id = ? AND project_id = ?');
const usersWithoutProject = db.prepare(
  'SELECT id, name FROM users WHERE id NOT IN (SELECT user_id FROM projects)',
);

db.transaction(() => {
  for (const row of crossOwned) {
    const name = row.name.trim();
    const own = findOwn.get(row.userId, name) as { id: number } | undefined;
    const targetId = own
      ? own.id
      : (insertProject.get(row.userId, name, row.description, row.active) as { id: number }).id;
    const moved = moveEntries.run(targetId, row.userId, row.projectId).changes;
    console.log(`User ${row.userId}: moved ${moved} entries from project ${row.projectId} to own project ${targetId} "${name}"`);
  }

  for (const user of usersWithoutProject.all() as { id: number; name: string }[]) {
    const { id } = insertProject.get(user.id, DEFAULT_PROJECT_NAME, null, 1) as { id: number };
    console.log(`User ${user.id} (${user.name}): created default project ${id}`);
  }
})();

console.log('Migration v24 complete');
db.close();
