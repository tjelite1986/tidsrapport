import { sqlite } from '@/lib/db';

// In-app notices for one user (migration v27): schedule changes picked up by
// the automatic sync, and room for other kinds later. The table is created here
// as well as in scripts/migrate-v27.ts so a fresh deploy works without a manual
// run. scripts/ cannot import lib/, so keep the two in step.
export const NOTIFICATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  date TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id, read_at);
`;

sqlite.exec(NOTIFICATIONS_TABLE_SQL);

const LIST_LIMIT = 100;

export interface Notification {
  id: number;
  kind: string;
  date: string | null;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export type NewNotification = { kind: string; date: string | null; title: string; body: string };

const insert = sqlite.prepare(
  'INSERT INTO notifications (user_id, kind, date, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)'
);

export function addNotifications(userId: number, notices: NewNotification[]): void {
  const now = new Date().toISOString();
  for (const n of notices) insert.run(userId, n.kind, n.date, n.title, n.body, now);
}

/** The latest notices, newest first. */
export function listNotifications(userId: number): Notification[] {
  return sqlite
    .prepare(
      `SELECT id, kind, date, title, body, created_at AS createdAt, read_at AS readAt
         FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ${LIST_LIMIT}`
    )
    .all(userId) as Notification[];
}

export function countUnreadNotifications(userId: number): number {
  const row = sqlite
    .prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL')
    .get(userId) as { n: number };
  return row.n;
}

export function markNotificationsRead(userId: number): void {
  sqlite
    .prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
    .run(new Date().toISOString(), userId);
}

export function deleteNotification(userId: number, id: number): boolean {
  return sqlite.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

/** Called from the user-deletion cascade in /api/users. */
export function deleteNotificationsForUser(userId: number): void {
  sqlite.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
}
