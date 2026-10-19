import { sqlite } from '@/lib/db';

// Direct messages between users (migration v21). The table is created here as
// well as in scripts/migrate-v21.ts so a fresh deploy works before anyone has
// run the migration by hand. scripts/ cannot import lib/, so keep the two in step.
export const MESSAGES_TABLE_SQL = `
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

sqlite.exec(MESSAGES_TABLE_SQL);

export const MAX_MESSAGE_LENGTH = 2000;
const CONVERSATION_LIMIT = 200;

export interface Message {
  id: number;
  senderId: number;
  recipientId: number;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface Contact {
  id: number;
  name: string;
  unread: number;
  lastMessage: string | null;
  lastAt: string | null;
}

const MESSAGE_COLUMNS = `id, sender_id AS senderId, recipient_id AS recipientId, body,
  created_at AS createdAt, read_at AS readAt`;

/** Every other user, with the latest message and the unread count from them. */
export function listContacts(userId: number): Contact[] {
  return sqlite
    .prepare(
      `SELECT u.id, u.name,
         (SELECT COUNT(*) FROM messages m
            WHERE m.sender_id = u.id AND m.recipient_id = @me AND m.read_at IS NULL) AS unread,
         last.body AS lastMessage,
         last.created_at AS lastAt
       FROM users u
       LEFT JOIN messages last ON last.id = (
         SELECT MAX(m.id) FROM messages m
          WHERE (m.sender_id = u.id AND m.recipient_id = @me)
             OR (m.sender_id = @me AND m.recipient_id = u.id))
       WHERE u.id != @me
       ORDER BY last.id IS NULL, last.id DESC, u.name COLLATE NOCASE`
    )
    .all({ me: userId }) as Contact[];
}

export function userExists(id: number): boolean {
  return !!sqlite.prepare('SELECT 1 FROM users WHERE id = ?').get(id);
}

/** The latest messages between two users, oldest first. */
export function listConversation(userId: number, otherId: number): Message[] {
  const rows = sqlite
    .prepare(
      `SELECT ${MESSAGE_COLUMNS} FROM messages
        WHERE (sender_id = @me AND recipient_id = @other)
           OR (sender_id = @other AND recipient_id = @me)
        ORDER BY id DESC LIMIT ${CONVERSATION_LIMIT}`
    )
    .all({ me: userId, other: otherId }) as Message[];
  return rows.reverse();
}

export function markConversationRead(userId: number, otherId: number): void {
  sqlite
    .prepare(
      `UPDATE messages SET read_at = ?
        WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL`
    )
    .run(new Date().toISOString(), userId, otherId);
}

export function sendMessage(senderId: number, recipientId: number, body: string): Message {
  return sqlite
    .prepare(
      `INSERT INTO messages (sender_id, recipient_id, body, created_at)
       VALUES (?, ?, ?, ?) RETURNING ${MESSAGE_COLUMNS}`
    )
    .get(senderId, recipientId, body, new Date().toISOString()) as Message;
}

export function countUnread(userId: number): number {
  const row = sqlite
    .prepare('SELECT COUNT(*) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL')
    .get(userId) as { n: number };
  return row.n;
}

/** Called from the user-deletion cascade: the FK would block deleting the user. */
export function deleteMessagesForUser(userId: number): void {
  sqlite.prepare('DELETE FROM messages WHERE sender_id = ? OR recipient_id = ?').run(userId, userId);
}
