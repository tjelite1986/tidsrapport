/**
 * Decide what one automatic schedule sync does, without touching the database.
 *
 * Every feed shift is remembered by its UID once seen (schedule_sync_items),
 * together with the times it was last written with. The rules:
 * - A new UID on a date from today on, with no time entry that day, becomes a
 *   time entry. Past dates are the user's record of what happened, so a sync
 *   never adds to them; a date that already has an entry is left alone.
 * - A UID seen before follows the feed (moved date, new times, new
 *   departments) only while the entry still looks exactly as the sync wrote
 *   it. An entry the user has edited — real clock-out time, say — is theirs.
 * - A synced entry from today on whose UID has left the feed is removed, under
 *   the same "untouched" condition. An empty feed removes nothing: that is far
 *   more likely an outage than a cleared schedule.
 * - An entry the user deleted is not recreated: its UID stays remembered.
 */
import type { IcsShift } from '@/lib/schedule-import/ics';

export type SyncShift = IcsShift & { uid: string };

export type SyncItem = {
  uid: string;
  date: string;
  startTime: string;
  endTime: string;
  description: string | null;
  entryId: number | null;
};

export type EntryRef = {
  id: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  description: string | null;
};

export type SyncPlan = {
  create: SyncShift[];
  update: { item: SyncItem; shift: SyncShift }[];
  remove: SyncItem[];
  /** New UIDs that get no entry, remembered so they are not reconsidered. */
  markSeen: SyncShift[];
};

export function descriptionFor(shift: IcsShift): string | null {
  return shift.departments.length > 0 ? shift.departments.join(', ') : null;
}

function untouched(entry: EntryRef, item: SyncItem): boolean {
  return (
    entry.date === item.date &&
    entry.startTime === item.startTime &&
    entry.endTime === item.endTime &&
    (entry.description ?? null) === (item.description ?? null)
  );
}

export function planSync(input: {
  shifts: SyncShift[];
  items: SyncItem[];
  entries: EntryRef[];
  today: string;
}): SyncPlan {
  const { shifts, items, entries, today } = input;
  const plan: SyncPlan = { create: [], update: [], remove: [], markSeen: [] };

  const itemsByUid = new Map(items.map((i) => [i.uid, i]));
  const entriesById = new Map(entries.map((e) => [e.id, e]));
  const datesWithEntry = new Set(entries.map((e) => e.date));
  const feedUids = new Set(shifts.map((s) => s.uid));

  for (const shift of shifts) {
    const item = itemsByUid.get(shift.uid);
    if (!item) {
      if (shift.date < today || datesWithEntry.has(shift.date)) {
        plan.markSeen.push(shift);
      } else {
        plan.create.push(shift);
        datesWithEntry.add(shift.date);
      }
      continue;
    }

    if (item.entryId == null) continue;
    const entry = entriesById.get(item.entryId);
    if (!entry || !untouched(entry, item)) continue;
    if (item.date < today && shift.date < today) continue;

    const changed =
      item.date !== shift.date ||
      item.startTime !== shift.startTime ||
      item.endTime !== shift.endTime ||
      (item.description ?? null) !== descriptionFor(shift);
    if (changed) plan.update.push({ item, shift });
  }

  if (shifts.length > 0) {
    for (const item of items) {
      if (feedUids.has(item.uid) || item.entryId == null || item.date < today) continue;
      const entry = entriesById.get(item.entryId);
      if (entry && untouched(entry, item)) plan.remove.push(item);
    }
  }

  return plan;
}
