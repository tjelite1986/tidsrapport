import { sqlite } from '@/lib/db';

// Personal calendar events (migration v22): meetings and other appointments a
// user puts in the calendar next to their shifts. They never affect pay. The
// table is created here as well as in scripts/migrate-v22.ts so a fresh deploy
// works before anyone has run the migration by hand. scripts/ cannot import
// lib/, so keep the two in step.
export const CALENDAR_EVENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  title TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date ON calendar_events (user_id, date);
`;

sqlite.exec(CALENDAR_EVENTS_TABLE_SQL);

export const MAX_TITLE_LENGTH = 120;
export const MAX_NOTE_LENGTH = 1000;
const RANGE_LIMIT = 500;

export interface CalendarEvent {
  id: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  note: string | null;
}

export interface CalendarEventInput {
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  note: string | null;
}

const EVENT_COLUMNS = `id, date, start_time AS startTime, end_time AS endTime, title, note`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validates a request body. Returns the cleaned input or an error message. */
export function parseEventInput(body: unknown): CalendarEventInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim() : null;
  const date = typeof b.date === 'string' ? b.date : '';
  const startTime = typeof b.startTime === 'string' && b.startTime ? b.startTime : null;
  const endTime = typeof b.endTime === 'string' && b.endTime ? b.endTime : null;

  if (!title) return 'Title is required';
  if (title.length > MAX_TITLE_LENGTH) return `Title exceeds ${MAX_TITLE_LENGTH} characters`;
  if (note && note.length > MAX_NOTE_LENGTH) return `Note exceeds ${MAX_NOTE_LENGTH} characters`;
  if (!DATE_RE.test(date)) return 'Invalid date';
  if (startTime && !TIME_RE.test(startTime)) return 'Invalid start time';
  if (endTime && !TIME_RE.test(endTime)) return 'Invalid end time';
  if (endTime && !startTime) return 'End time requires a start time';
  if (startTime && endTime && endTime <= startTime) return 'End time must be after start time';

  return { date, startTime, endTime, title, note };
}

/** The user's events between two dates (inclusive), all-day events first per day. */
export function listEvents(userId: number, startDate: string, endDate: string): CalendarEvent[] {
  return sqlite
    .prepare(
      `SELECT ${EVENT_COLUMNS} FROM calendar_events
        WHERE user_id = ? AND date >= ? AND date <= ?
        ORDER BY date, start_time IS NOT NULL, start_time, id
        LIMIT ${RANGE_LIMIT}`
    )
    .all(userId, startDate, endDate) as CalendarEvent[];
}

export function createEvent(userId: number, input: CalendarEventInput): CalendarEvent {
  return sqlite
    .prepare(
      `INSERT INTO calendar_events (user_id, date, start_time, end_time, title, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING ${EVENT_COLUMNS}`
    )
    .get(
      userId, input.date, input.startTime, input.endTime, input.title, input.note,
      new Date().toISOString()
    ) as CalendarEvent;
}

/** Returns null when the event does not exist or belongs to someone else. */
export function updateEvent(userId: number, id: number, input: CalendarEventInput): CalendarEvent | null {
  const row = sqlite
    .prepare(
      `UPDATE calendar_events SET date = ?, start_time = ?, end_time = ?, title = ?, note = ?
        WHERE id = ? AND user_id = ? RETURNING ${EVENT_COLUMNS}`
    )
    .get(input.date, input.startTime, input.endTime, input.title, input.note, id, userId);
  return (row as CalendarEvent | undefined) ?? null;
}

/** Returns false when the event does not exist or belongs to someone else. */
export function deleteEvent(userId: number, id: number): boolean {
  return sqlite.prepare('DELETE FROM calendar_events WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

/** Called from the user-deletion cascade: the FK would block deleting the user. */
export function deleteEventsForUser(userId: number): void {
  sqlite.prepare('DELETE FROM calendar_events WHERE user_id = ?').run(userId);
}
