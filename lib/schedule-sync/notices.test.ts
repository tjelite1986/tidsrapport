import { describe, expect, it } from 'vitest';
import { pairReplacedShifts, planSync, type SyncShift } from './plan';
import { formatDay, planNotices, type SeenItem } from './notices';

const TODAY = '2026-10-22';

function shift(uid: string, date: string, startTime = '08:00', endTime = '16:00', departments = ['Kassa']): SyncShift {
  return { uid, date, startTime, endTime, departments, summary: `Store - ${departments.join(', ')}` };
}

function item(uid: string, date: string, entryId: number | null, startTime = '08:00', endTime = '16:00', extra: Partial<SeenItem> = {}): SeenItem {
  return {
    uid, date, startTime, endTime, description: 'Kassa', entryId,
    seenDate: date, seenStart: startTime, seenEnd: endTime, seenDescription: 'Kassa',
    firstDate: date, firstStart: startTime, firstEnd: endTime, gone: 0,
    ...extra,
  };
}

function entry(id: number, date: string, startTime = '08:00', endTime = '16:00') {
  return { id, date, startTime, endTime, description: 'Kassa' };
}

function run(shifts: SyncShift[], items: SeenItem[], entries: ReturnType<typeof entry>[]) {
  const plan = planSync({ shifts, items, entries, today: TODAY });
  return planNotices({ shifts, items, plan, today: TODAY });
}

describe('planNotices', () => {
  it('formats a calendar day without shifting it', () => {
    expect(formatDay('2026-10-30')).toBe('fre 30 okt');
  });

  it('reports nothing when the feed is unchanged', () => {
    expect(run([shift('a', '2026-11-01')], [item('a', '2026-11-01', 1)], [entry(1, '2026-11-01')])).toEqual([]);
  });

  it('reports a changed shift that the sync applied', () => {
    const [n] = run([shift('a', '2026-11-01', '10:00', '18:00')], [item('a', '2026-11-01', 1)], [entry(1, '2026-11-01')]);
    expect(n.kind).toBe('shift_changed');
    expect(n.body.split('\n')[0]).toBe('sön 1 nov 08:00–16:00 → 10:00–18:00');
    expect(n.body).toContain('är uppdaterad');
  });

  it('reports a change the sync could not apply because the user edited the entry', () => {
    const [n] = run([shift('a', '2026-11-01', '10:00', '18:00')], [item('a', '2026-11-01', 1)], [entry(1, '2026-11-01', '08:00', '16:30')]);
    expect(n.body).toContain('inte ändrad eftersom du har redigerat');
  });

  it('reports a change to a past shift as made after the fact', () => {
    const [n] = run([shift('a', '2026-10-20', '08:00', '17:00')], [item('a', '2026-10-20', 1)], [entry(1, '2026-10-20')]);
    expect(n.title).toMatch(/i efterhand/);
    expect(n.body).toContain('Datumet har passerat');
  });

  it('compares against the last pass, not the entry, so a change is reported once', () => {
    // The feed already said 10-18 last pass; the entry stayed at 08-16 because the user edited it
    const seen = item('a', '2026-11-01', 1, '08:00', '16:00', { seenStart: '10:00', seenEnd: '18:00' });
    expect(run([shift('a', '2026-11-01', '10:00', '18:00')], [seen], [entry(1, '2026-11-01', '08:00', '16:30')])).toEqual([]);
  });

  it('shows the original schedule when the shift has changed before', () => {
    const seen = item('a', '2026-11-01', 1, '10:00', '18:00', { firstStart: '08:00', firstEnd: '16:00' });
    const [n] = run([shift('a', '2026-11-01', '12:00', '20:00')], [seen], [entry(1, '2026-11-01', '10:00', '18:00')]);
    expect(n.body).toContain('Ursprungligt schema: ');
    expect(n.body).toContain('08:00–16:00');
  });

  it('reports a department change', () => {
    const [n] = run([shift('a', '2026-11-01', '08:00', '16:00', ['Kundservice'])], [item('a', '2026-11-01', 1)], [entry(1, '2026-11-01')]);
    expect(n.body).toContain('Avdelning: Kassa → Kundservice');
  });

  it('only records a shift that was never compared before', () => {
    const fresh = item('a', '2026-11-01', 1, '08:00', '16:00', { seenDate: null, seenStart: null, seenEnd: null });
    expect(run([shift('a', '2026-11-01', '10:00', '18:00')], [fresh], [entry(1, '2026-11-01')])).toEqual([]);
  });

  it('gathers new shifts from today on into one notice', () => {
    const notices = run(
      [shift('a', '2026-11-01'), shift('b', '2026-11-03'), shift('c', '2026-11-02'), shift('old', '2026-10-01')],
      [item('a', '2026-11-01', 1)],
      [entry(1, '2026-11-01')],
    );
    expect(notices).toHaveLength(1);
    expect(notices[0].kind).toBe('shift_new');
    expect(notices[0].title).toBe('2 nya pass i schemat');
    expect(notices[0].date).toBe('2026-11-02');
  });

  it('says nothing about new shifts on the first sync', () => {
    expect(run([shift('a', '2026-11-01'), shift('b', '2026-11-02')], [], [])).toEqual([]);
  });

  it('reports a removed future shift once, and not a past one leaving the feed', () => {
    const items = [item('a', '2026-11-01', 1), item('b', '2026-11-02', 2), item('gone', '2026-11-03', null, '08:00', '16:00', { gone: 1 }), item('past', '2026-10-01', 3)];
    const notices = run([shift('a', '2026-11-01')], items, [entry(1, '2026-11-01'), entry(2, '2026-11-02'), entry(3, '2026-10-01')]);
    expect(notices.map((n) => [n.kind, n.uid])).toEqual([['shift_removed', 'b']]);
    expect(notices[0].body).toContain('är borttagen');
  });

  it('reports nothing removed when the feed is empty', () => {
    expect(run([], [item('a', '2026-11-01', 1)], [entry(1, '2026-11-01')])).toEqual([]);
  });

  it('reports a shift the feed replaced under a new UID as a change, and the hand-made entry as updated', () => {
    const shifts = [shift('new', '2026-10-27', '06:00', '15:00')];
    const stored = [item('old', '2026-10-27', null, '06:00', '10:15')];
    const today = '2026-10-27';
    const pairs = pairReplacedShifts({ shifts, items: stored, today });
    const items = stored.map((i) => (i.uid === pairs.get('new') ? { ...i, uid: 'new' } : i));
    const entries = [{ id: 588, date: '2026-10-27', startTime: '06:00', endTime: '10:15', description: null }];
    const plan = planSync({ shifts, items, entries, today });
    const notices = planNotices({ shifts, items, plan, today });
    expect(notices).toHaveLength(1);
    expect(notices[0].kind).toBe('shift_changed');
    expect(notices[0].body).toContain('06:00–10:15 → 06:00–15:00');
    expect(notices[0].body).toContain('Din inlagda tid är uppdaterad.');
  });
});
