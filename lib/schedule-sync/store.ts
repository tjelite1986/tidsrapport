import { sqlite } from '@/lib/db';
import { calculateAutoBreak, calculateWorkHours, generateBreakPeriod, type BreakRule } from '@/lib/calculations';
import { serializeBreakPeriods } from '@/lib/types/break-periods';
import { addColumnsIfMissing } from '@/lib/db/add-columns';
import { addNotifications } from '@/lib/notifications/store';
import { fetchIcs } from '@/lib/schedule-import/fetch-ics';
import { parseIcsSchedule } from '@/lib/schedule-import/ics';
import { descriptionFor, planSync, type EntryRef, type SyncShift } from './plan';
import { planNotices, type SeenItem } from './notices';

// Feed shifts the automatic sync has seen (migration v26), keyed by the feed's
// UID, with the values the sync last wrote. Created here as well as in
// scripts/migrate-v26.ts so a fresh deploy works without a manual run.
// scripts/ cannot import lib/, so keep the two in step.
export const SCHEDULE_SYNC_ITEMS_SQL = `
CREATE TABLE IF NOT EXISTS schedule_sync_items (
  user_id INTEGER NOT NULL,
  uid TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  description TEXT,
  entry_id INTEGER,
  PRIMARY KEY (user_id, uid)
)`;

// v27: what the feed said on the last pass, so changes can be reported once,
// and the shift as first seen, to show the original schedule. Also in
// scripts/migrate-v27.ts.
export const SYNC_ITEM_SEEN_COLUMNS = [
  { name: 'seen_date', ddl: 'seen_date TEXT' },
  { name: 'seen_start', ddl: 'seen_start TEXT' },
  { name: 'seen_end', ddl: 'seen_end TEXT' },
  { name: 'seen_description', ddl: 'seen_description TEXT' },
  { name: 'first_date', ddl: 'first_date TEXT' },
  { name: 'first_start', ddl: 'first_start TEXT' },
  { name: 'first_end', ddl: 'first_end TEXT' },
  { name: 'gone', ddl: 'gone INTEGER NOT NULL DEFAULT 0' },
];

sqlite.exec(SCHEDULE_SYNC_ITEMS_SQL);
addColumnsIfMissing(sqlite, 'schedule_sync_items', SYNC_ITEM_SEEN_COLUMNS);

export const SYNC_INTERVAL_MINUTES = 30;

export type SyncResult = { created: number; updated: number; removed: number; notices: number };

type SyncSettings = {
  url: string | null;
  enabled: number;
  projectId: number | null;
  autoBreakRules: string | null;
};

/** Today's date in Sweden — the container's own clock may be UTC. */
export function swedishToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' }).format(now);
}

function breakRules(json: string | null): BreakRule[] | undefined {
  if (!json) return undefined;
  try { return JSON.parse(json); } catch { return undefined; }
}

function writeStatus(userId: number, status: string): void {
  sqlite
    .prepare('UPDATE user_settings SET schedule_synced_at = ?, schedule_sync_status = ? WHERE user_id = ?')
    .run(new Date().toISOString(), status, userId);
}

/** Fetch the user's feed and bring their future time entries in line with it. */
export async function syncScheduleForUser(userId: number): Promise<SyncResult> {
  const settings = sqlite
    .prepare(`SELECT schedule_ics_url AS url, schedule_sync_enabled AS enabled,
                     schedule_sync_project_id AS projectId, auto_break_rules AS autoBreakRules
              FROM user_settings WHERE user_id = ?`)
    .get(userId) as SyncSettings | undefined;
  if (!settings?.url) throw new Error('No schedule link saved');

  const project = settings.projectId == null ? undefined : sqlite
    .prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
    .get(settings.projectId, userId);
  if (!project) {
    writeStatus(userId, 'error: project missing');
    throw new Error('Sync project missing');
  }

  let shifts: SyncShift[];
  try {
    const parsed = parseIcsSchedule(await fetchIcs(settings.url));
    shifts = parsed.shifts.filter((s): s is SyncShift => s.uid != null);
  } catch (err) {
    writeStatus(userId, `error: ${err instanceof Error ? err.message : 'fetch failed'}`);
    throw err;
  }

  const today = swedishToday();
  const items = (sqlite
    .prepare(`SELECT uid, date, start_time AS startTime, end_time AS endTime, description, entry_id AS entryId,
                     seen_date AS seenDate, seen_start AS seenStart, seen_end AS seenEnd,
                     seen_description AS seenDescription, first_date AS firstDate, first_start AS firstStart,
                     first_end AS firstEnd, gone
              FROM schedule_sync_items WHERE user_id = ?`)
    .all(userId)) as SeenItem[];
  const earliest = [...shifts.map((s) => s.date), ...items.map((i) => i.date), today].sort()[0];
  const entries = sqlite
    .prepare(`SELECT id, date, start_time AS startTime, end_time AS endTime, description
              FROM time_entries WHERE user_id = ? AND date >= ?`)
    .all(userId, earliest) as EntryRef[];

  const vacationDates = (sqlite
    .prepare('SELECT date FROM vacation_days WHERE user_id = ? AND date >= ?')
    .all(userId, earliest) as { date: string }[]).map((v) => v.date);

  const plan = planSync({ shifts, items, entries, today, vacationDates });
  const notices = planNotices({ shifts, items, plan, today });
  const rules = breakRules(settings.autoBreakRules);

  const hoursFor = (shift: SyncShift) => {
    const breakMinutes = calculateAutoBreak(shift.startTime, shift.endTime, rules);
    // Place the break mid-shift like the time form does, so it shows with times and OB sees where it falls
    const breakPeriods = breakMinutes > 0
      ? serializeBreakPeriods([generateBreakPeriod(shift.startTime, shift.endTime, breakMinutes)])
      : null;
    return { breakMinutes, breakPeriods, hours: calculateWorkHours(shift.startTime, shift.endTime, breakMinutes) };
  };

  const insertEntry = sqlite.prepare(`INSERT INTO time_entries
    (user_id, project_id, date, hours, start_time, end_time, break_minutes, break_periods, entry_type, overtime_type, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'work', 'none', ?, ?)`);
  const updateEntry = sqlite.prepare(`UPDATE time_entries
    SET date = ?, hours = ?, start_time = ?, end_time = ?, break_minutes = ?, break_periods = ?, description = ?
    WHERE id = ? AND user_id = ?`);
  const deleteEntry = sqlite.prepare('DELETE FROM time_entries WHERE id = ? AND user_id = ?');
  // A new row's first_* is the shift as first seen; a row from before v27 takes the values the sync last wrote
  const upsertItem = sqlite.prepare(`INSERT INTO schedule_sync_items
    (user_id, uid, date, start_time, end_time, description, entry_id, first_date, first_start, first_end)
    VALUES (@userId, @uid, @date, @start, @end, @description, @entryId, @date, @start, @end)
    ON CONFLICT (user_id, uid) DO UPDATE SET date = excluded.date, start_time = excluded.start_time,
      end_time = excluded.end_time, description = excluded.description, entry_id = excluded.entry_id,
      first_date = COALESCE(first_date, date), first_start = COALESCE(first_start, start_time),
      first_end = COALESCE(first_end, end_time)`);
  const writeItem = (shift: SyncShift, description: string | null, entryId: number | null) =>
    upsertItem.run({ userId, uid: shift.uid, date: shift.date, start: shift.startTime, end: shift.endTime, description, entryId });
  const deleteItem = sqlite.prepare('DELETE FROM schedule_sync_items WHERE user_id = ? AND uid = ?');
  const markSeenInFeed = sqlite.prepare(`UPDATE schedule_sync_items
    SET seen_date = ?, seen_start = ?, seen_end = ?, seen_description = ?, gone = 0 WHERE user_id = ? AND uid = ?`);
  const markGone = sqlite.prepare('UPDATE schedule_sync_items SET gone = 1 WHERE user_id = ? AND uid = ?');

  const apply = sqlite.transaction(() => {
    let created = 0;
    for (const shift of plan.create) {
      const { breakMinutes, breakPeriods, hours } = hoursFor(shift);
      // Same bounds as the time-entry API: a shift that computes to nothing is not an entry
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
        writeItem(shift, descriptionFor(shift), null);
        continue;
      }
      const description = descriptionFor(shift);
      const info = insertEntry.run(userId, settings.projectId, shift.date, hours, shift.startTime, shift.endTime,
        breakMinutes, breakPeriods, description, new Date().toISOString());
      writeItem(shift, description, Number(info.lastInsertRowid));
      created++;
    }
    for (const shift of plan.markSeen) {
      writeItem(shift, descriptionFor(shift), null);
    }
    for (const { item, shift } of plan.update) {
      const { breakMinutes, breakPeriods, hours } = hoursFor(shift);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) continue;
      const description = descriptionFor(shift);
      updateEntry.run(shift.date, hours, shift.startTime, shift.endTime, breakMinutes, breakPeriods, description, item.entryId, userId);
      writeItem(shift, description, item.entryId);
    }
    for (const item of plan.remove) {
      deleteEntry.run(item.entryId, userId);
      deleteItem.run(userId, item.uid);
    }
    // Remember what the feed said this pass, so the next one reports only what changes after it
    for (const shift of shifts) {
      markSeenInFeed.run(shift.date, shift.startTime, shift.endTime, descriptionFor(shift), userId, shift.uid);
    }
    for (const n of notices) {
      if (n.kind === 'shift_removed' && n.uid) markGone.run(userId, n.uid);
    }
    addNotifications(userId, notices);
    return { created, updated: plan.update.length, removed: plan.remove.length, notices: notices.length };
  });

  const result = apply();
  writeStatus(userId, `ok: ${result.created} new, ${result.updated} changed, ${result.removed} removed`);
  return result;
}

/** One pass over every user who has switched the sync on. */
export async function syncAllSchedules(): Promise<void> {
  const users = sqlite
    .prepare(`SELECT user_id AS userId FROM user_settings
              WHERE schedule_sync_enabled = 1 AND schedule_ics_url IS NOT NULL`)
    .all() as { userId: number }[];
  for (const { userId } of users) {
    try {
      const r = await syncScheduleForUser(userId);
      if (r.created || r.updated || r.removed || r.notices) {
        console.log(`schedule-sync user ${userId}: ${r.created} new, ${r.updated} changed, ${r.removed} removed, ${r.notices} notices`);
      }
    } catch (err) {
      console.error(`schedule-sync user ${userId} failed:`, err instanceof Error ? err.message : err);
    }
  }
}

export function deleteSyncItemsForUser(userId: number): void {
  sqlite.prepare('DELETE FROM schedule_sync_items WHERE user_id = ?').run(userId);
}
