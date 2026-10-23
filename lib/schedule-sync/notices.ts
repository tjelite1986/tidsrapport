/**
 * Decide which schedule changes to tell the user about, without touching the
 * database. The comparison is against what the feed said on the previous pass
 * (the item's `seen*` values), not against the time entry, so every change in
 * the employer's schedule is reported once — whether or not the sync could
 * apply it to the entry.
 * - A shift whose date, times or departments differ from the last pass is a
 *   change. The notice says whether the entry followed, and shows the shift as
 *   first seen when that differs from the previous version.
 * - New shifts from today on are gathered into one notice per pass. The very
 *   first pass for a user reports none: that is the whole schedule arriving.
 * - A shift from today on that has left the feed is reported once (`gone`).
 * - An item never compared before (`seenDate` null, e.g. right after the
 *   migration) is only recorded, so turning this on does not flood the bell.
 */
import { descriptionFor, type SyncItem, type SyncPlan, type SyncShift } from './plan';

export type SeenItem = SyncItem & {
  seenDate: string | null;
  seenStart: string | null;
  seenEnd: string | null;
  seenDescription: string | null;
  firstDate: string | null;
  firstStart: string | null;
  firstEnd: string | null;
  gone: number;
};

export type NoticeKind = 'shift_changed' | 'shift_new' | 'shift_removed';

/** `uid` is set on a removal, so the store can mark that item as reported. */
export type Notice = { kind: NoticeKind; date: string; title: string; body: string; uid?: string };

const MAX_LISTED_NEW = 10;

const dayFormat = new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "tor 30 okt" — the date is a calendar day, so format it in UTC to keep it from shifting. */
export function formatDay(date: string): string {
  return dayFormat.format(new Date(`${date}T00:00:00Z`)).replace(/\./g, '');
}

function slot(date: string, start: string, end: string): string {
  return `${formatDay(date)} ${start}–${end}`;
}

export function planNotices(input: {
  shifts: SyncShift[];
  items: SeenItem[];
  plan: SyncPlan;
  today: string;
}): Notice[] {
  const { shifts, items, plan, today } = input;
  const notices: Notice[] = [];
  const itemsByUid = new Map(items.map((i) => [i.uid, i]));
  const applied = new Set(plan.update.map((u) => u.item.uid));
  const removed = new Set(plan.remove.map((i) => i.uid));
  const firstSync = items.length === 0;

  const fresh: SyncShift[] = [];
  for (const shift of shifts) {
    const item = itemsByUid.get(shift.uid);
    if (!item) {
      if (!firstSync && shift.date >= today) fresh.push(shift);
      continue;
    }
    if (item.seenDate == null || item.seenStart == null || item.seenEnd == null) continue;

    const description = descriptionFor(shift);
    const timesChanged = item.seenDate !== shift.date || item.seenStart !== shift.startTime || item.seenEnd !== shift.endTime;
    const deptChanged = (item.seenDescription ?? null) !== description;
    if (!timesChanged && !deptChanged) continue;

    const lines: string[] = [];
    if (timesChanged) {
      const after = item.seenDate === shift.date ? `${shift.startTime}–${shift.endTime}` : slot(shift.date, shift.startTime, shift.endTime);
      lines.push(`${slot(item.seenDate, item.seenStart, item.seenEnd)} → ${after}`);
    }
    if (deptChanged) lines.push(`Avdelning: ${item.seenDescription ?? '–'} → ${description ?? '–'}`);
    if (
      item.firstDate && item.firstStart && item.firstEnd &&
      (item.firstDate !== item.seenDate || item.firstStart !== item.seenStart || item.firstEnd !== item.seenEnd)
    ) {
      lines.push(`Ursprungligt schema: ${slot(item.firstDate, item.firstStart, item.firstEnd)}`);
    }
    if (applied.has(item.uid)) {
      lines.push('Din inlagda tid är uppdaterad.');
    } else if (item.entryId == null) {
      lines.push('Synken har ingen tid inlagd för passet.');
    } else if (item.date < today && shift.date < today) {
      lines.push('Datumet har passerat, så din inlagda tid är inte ändrad.');
    } else {
      lines.push('Din inlagda tid är inte ändrad eftersom du har redigerat eller tagit bort den.');
    }

    notices.push({
      kind: 'shift_changed',
      date: shift.date,
      title: shift.date < today ? `Pass ändrat i efterhand ${formatDay(shift.date)}` : `Schemat ändrat ${formatDay(shift.date)}`,
      body: lines.join('\n'),
    });
  }

  if (fresh.length > 0) {
    fresh.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    const listed = fresh.slice(0, MAX_LISTED_NEW).map((s) => slot(s.date, s.startTime, s.endTime));
    if (fresh.length > MAX_LISTED_NEW) listed.push(`+ ${fresh.length - MAX_LISTED_NEW} till`);
    notices.push({
      kind: 'shift_new',
      date: fresh[0].date,
      title: fresh.length === 1 ? 'Nytt pass i schemat' : `${fresh.length} nya pass i schemat`,
      body: listed.join('\n'),
    });
  }

  // An empty feed is more likely an outage than a cleared schedule — the sync removes nothing then, nor do we report
  if (shifts.length > 0) {
    const feedUids = new Set(shifts.map((s) => s.uid));
    for (const item of items) {
      if (feedUids.has(item.uid) || item.gone || item.date < today) continue;
      const lines = [slot(item.date, item.startTime, item.endTime)];
      if (removed.has(item.uid)) lines.push('Din inlagda tid är borttagen.');
      else if (item.entryId != null) lines.push('Din inlagda tid ligger kvar eftersom du har redigerat den.');
      notices.push({
        kind: 'shift_removed',
        uid: item.uid,
        date: item.date,
        title: `Pass borttaget ${formatDay(item.date)}`,
        body: lines.join('\n'),
      });
    }
  }

  return notices;
}
