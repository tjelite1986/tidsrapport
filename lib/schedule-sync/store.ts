import { sqlite } from '@/lib/db';
import { calculateAutoBreak, calculateWorkHours, type BreakRule } from '@/lib/calculations';
import { fetchIcs } from '@/lib/schedule-import/fetch-ics';
import { parseIcsSchedule } from '@/lib/schedule-import/ics';
import { descriptionFor, planSync, type EntryRef, type SyncItem, type SyncShift } from './plan';

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

sqlite.exec(SCHEDULE_SYNC_ITEMS_SQL);

export const SYNC_INTERVAL_MINUTES = 30;

export type SyncResult = { created: number; updated: number; removed: number };

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
    .prepare(`SELECT uid, date, start_time AS startTime, end_time AS endTime, description, entry_id AS entryId
              FROM schedule_sync_items WHERE user_id = ?`)
    .all(userId)) as SyncItem[];
  const earliest = [...shifts.map((s) => s.date), ...items.map((i) => i.date), today].sort()[0];
  const entries = sqlite
    .prepare(`SELECT id, date, start_time AS startTime, end_time AS endTime, description
              FROM time_entries WHERE user_id = ? AND date >= ?`)
    .all(userId, earliest) as EntryRef[];

  const plan = planSync({ shifts, items, entries, today });
  const rules = breakRules(settings.autoBreakRules);

  const hoursFor = (shift: SyncShift) => {
    const breakMinutes = calculateAutoBreak(shift.startTime, shift.endTime, rules);
    return { breakMinutes, hours: calculateWorkHours(shift.startTime, shift.endTime, breakMinutes) };
  };

  const insertEntry = sqlite.prepare(`INSERT INTO time_entries
    (user_id, project_id, date, hours, start_time, end_time, break_minutes, entry_type, overtime_type, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'work', 'none', ?, ?)`);
  const updateEntry = sqlite.prepare(`UPDATE time_entries
    SET date = ?, hours = ?, start_time = ?, end_time = ?, break_minutes = ?, description = ?
    WHERE id = ? AND user_id = ?`);
  const deleteEntry = sqlite.prepare('DELETE FROM time_entries WHERE id = ? AND user_id = ?');
  const upsertItem = sqlite.prepare(`INSERT INTO schedule_sync_items
    (user_id, uid, date, start_time, end_time, description, entry_id) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, uid) DO UPDATE SET date = excluded.date, start_time = excluded.start_time,
      end_time = excluded.end_time, description = excluded.description, entry_id = excluded.entry_id`);
  const deleteItem = sqlite.prepare('DELETE FROM schedule_sync_items WHERE user_id = ? AND uid = ?');

  const apply = sqlite.transaction(() => {
    let created = 0;
    for (const shift of plan.create) {
      const { breakMinutes, hours } = hoursFor(shift);
      // Same bounds as the time-entry API: a shift that computes to nothing is not an entry
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
        upsertItem.run(userId, shift.uid, shift.date, shift.startTime, shift.endTime, descriptionFor(shift), null);
        continue;
      }
      const description = descriptionFor(shift);
      const info = insertEntry.run(userId, settings.projectId, shift.date, hours, shift.startTime, shift.endTime,
        breakMinutes, description, new Date().toISOString());
      upsertItem.run(userId, shift.uid, shift.date, shift.startTime, shift.endTime, description, Number(info.lastInsertRowid));
      created++;
    }
    for (const shift of plan.markSeen) {
      upsertItem.run(userId, shift.uid, shift.date, shift.startTime, shift.endTime, descriptionFor(shift), null);
    }
    for (const { item, shift } of plan.update) {
      const { breakMinutes, hours } = hoursFor(shift);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) continue;
      const description = descriptionFor(shift);
      updateEntry.run(shift.date, hours, shift.startTime, shift.endTime, breakMinutes, description, item.entryId, userId);
      upsertItem.run(userId, shift.uid, shift.date, shift.startTime, shift.endTime, description, item.entryId);
    }
    for (const item of plan.remove) {
      deleteEntry.run(item.entryId, userId);
      deleteItem.run(userId, item.uid);
    }
    return { created, updated: plan.update.length, removed: plan.remove.length };
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
      if (r.created || r.updated || r.removed) {
        console.log(`schedule-sync user ${userId}: ${r.created} new, ${r.updated} changed, ${r.removed} removed`);
      }
    } catch (err) {
      console.error(`schedule-sync user ${userId} failed:`, err instanceof Error ? err.message : err);
    }
  }
}

export function deleteSyncItemsForUser(userId: number): void {
  sqlite.prepare('DELETE FROM schedule_sync_items WHERE user_id = ?').run(userId);
}
