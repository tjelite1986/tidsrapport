import { sqlite } from '@/lib/db';
import { addColumnsIfMissing } from '@/lib/db/add-columns';
import { RECURRENCES, occurrencesInRange, type Recurrence } from './recurrence';

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
// v23: recurring events. `date` stays the first occurrence; excluded_dates is a
// JSON array of single occurrences the user removed from the series.
addColumnsIfMissing(sqlite, 'calendar_events', [
  { name: 'recurrence', ddl: "recurrence TEXT NOT NULL DEFAULT 'none'" },
  { name: 'recurrence_until', ddl: 'recurrence_until TEXT' },
  { name: 'excluded_dates', ddl: "excluded_dates TEXT NOT NULL DEFAULT '[]'" },
]);

export const MAX_TITLE_LENGTH = 120;
export const MAX_NOTE_LENGTH = 1000;
const RANGE_LIMIT = 500;

export interface CalendarEventInput {
  date: string; // first occurrence for a recurring event
  startTime: string | null;
  endTime: string | null;
  title: string;
  note: string | null;
  recurrence: Recurrence;
  recurrenceUntil: string | null;
}

/** One stored event (a whole series when recurring). */
export interface CalendarEventSeries extends CalendarEventInput {
  id: number;
}

/** One occurrence as the calendar shows it: `date` is this occurrence, `seriesDate` the first. */
export interface CalendarEvent extends CalendarEventSeries {
  seriesDate: string;
}

const EVENT_COLUMNS = `id, date, start_time AS startTime, end_time AS endTime, title, note,
  recurrence, recurrence_until AS recurrenceUntil`;

function readExcludedDates(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

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
  const recurrence = (typeof b.recurrence === 'string' && b.recurrence ? b.recurrence : 'none') as Recurrence;
  const recurrenceUntil =
    recurrence !== 'none' && typeof b.recurrenceUntil === 'string' && b.recurrenceUntil ? b.recurrenceUntil : null;

  if (!title) return 'Title is required';
  if (title.length > MAX_TITLE_LENGTH) return `Title exceeds ${MAX_TITLE_LENGTH} characters`;
  if (note && note.length > MAX_NOTE_LENGTH) return `Note exceeds ${MAX_NOTE_LENGTH} characters`;
  if (!DATE_RE.test(date)) return 'Invalid date';
  if (startTime && !TIME_RE.test(startTime)) return 'Invalid start time';
  if (endTime && !TIME_RE.test(endTime)) return 'Invalid end time';
  if (endTime && !startTime) return 'End time requires a start time';
  if (startTime && endTime && endTime <= startTime) return 'End time must be after start time';
  if (!RECURRENCES.includes(recurrence)) return 'Invalid recurrence';
  if (recurrenceUntil && !DATE_RE.test(recurrenceUntil)) return 'Invalid recurrence end date';
  if (recurrenceUntil && recurrenceUntil < date) return 'Recurrence end date is before the first date';

  return { date, startTime, endTime, title, note, recurrence, recurrenceUntil };
}

/**
 * The user's event occurrences between two dates (inclusive), recurring series
 * expanded, all-day events first per day.
 */
export function listEvents(userId: number, startDate: string, endDate: string): CalendarEvent[] {
  const rows = sqlite
    .prepare(
      `SELECT ${EVENT_COLUMNS}, excluded_dates AS excludedDates FROM calendar_events
        WHERE user_id = @userId AND date <= @endDate
          AND (date >= @startDate
               OR (recurrence != 'none' AND (recurrence_until IS NULL OR recurrence_until >= @startDate)))`
    )
    .all({ userId, startDate, endDate }) as (CalendarEventSeries & { excludedDates: string })[];

  const events: CalendarEvent[] = [];
  for (const { excludedDates, ...series } of rows) {
    const dates = occurrencesInRange(
      { ...series, excludedDates: readExcludedDates(excludedDates) },
      startDate,
      endDate
    );
    for (const date of dates) events.push({ ...series, date, seriesDate: series.date });
  }
  events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(a.startTime !== null) - Number(b.startTime !== null) ||
      (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
      a.id - b.id
  );
  return events.slice(0, RANGE_LIMIT);
}

export function createEvent(userId: number, input: CalendarEventInput): CalendarEventSeries {
  return sqlite
    .prepare(
      `INSERT INTO calendar_events
         (user_id, date, start_time, end_time, title, note, recurrence, recurrence_until, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${EVENT_COLUMNS}`
    )
    .get(
      userId, input.date, input.startTime, input.endTime, input.title, input.note,
      input.recurrence, input.recurrenceUntil, new Date().toISOString()
    ) as CalendarEventSeries;
}

/** Updates the whole series. Returns null when the event does not exist or belongs to someone else. */
export function updateEvent(userId: number, id: number, input: CalendarEventInput): CalendarEventSeries | null {
  const row = sqlite
    .prepare(
      `UPDATE calendar_events SET date = ?, start_time = ?, end_time = ?, title = ?, note = ?,
              recurrence = ?, recurrence_until = ?
        WHERE id = ? AND user_id = ? RETURNING ${EVENT_COLUMNS}`
    )
    .get(
      input.date, input.startTime, input.endTime, input.title, input.note,
      input.recurrence, input.recurrenceUntil, id, userId
    );
  return (row as CalendarEventSeries | undefined) ?? null;
}

/**
 * Removes one occurrence from a recurring series. Returns false when the event
 * does not exist or belongs to someone else.
 */
export function excludeOccurrence(userId: number, id: number, date: string): boolean {
  const row = sqlite
    .prepare('SELECT excluded_dates AS excludedDates FROM calendar_events WHERE id = ? AND user_id = ?')
    .get(id, userId) as { excludedDates: string } | undefined;
  if (!row) return false;
  const dates = new Set(readExcludedDates(row.excludedDates));
  dates.add(date);
  sqlite
    .prepare('UPDATE calendar_events SET excluded_dates = ? WHERE id = ? AND user_id = ?')
    .run(JSON.stringify([...dates].sort()), id, userId);
  return true;
}

/** Returns false when the event does not exist or belongs to someone else. */
export function deleteEvent(userId: number, id: number): boolean {
  return sqlite.prepare('DELETE FROM calendar_events WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

/** Called from the user-deletion cascade: the FK would block deleting the user. */
export function deleteEventsForUser(userId: number): void {
  sqlite.prepare('DELETE FROM calendar_events WHERE user_id = ?').run(userId);
}
