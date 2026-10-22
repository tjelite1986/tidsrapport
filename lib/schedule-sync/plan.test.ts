import { describe, expect, it } from 'vitest';
import { planSync, type EntryRef, type SyncItem, type SyncShift } from './plan';

const TODAY = '2026-10-22';

function shift(uid: string, date: string, startTime = '08:00', endTime = '16:00', departments = ['Kassa']): SyncShift {
  return { uid, date, startTime, endTime, departments, summary: `Store - ${departments.join(', ')}` };
}

function item(uid: string, date: string, entryId: number | null, startTime = '08:00', endTime = '16:00'): SyncItem {
  return { uid, date, startTime, endTime, description: 'Kassa', entryId };
}

function entry(id: number, date: string, startTime = '08:00', endTime = '16:00', description: string | null = 'Kassa'): EntryRef {
  return { id, date, startTime, endTime, description };
}

describe('planSync', () => {
  it('creates new shifts from today on and only remembers past ones', () => {
    const plan = planSync({ shifts: [shift('a', '2026-10-20'), shift('b', TODAY), shift('c', '2026-11-01')], items: [], entries: [], today: TODAY });
    expect(plan.create.map((s) => s.uid)).toEqual(['b', 'c']);
    expect(plan.markSeen.map((s) => s.uid)).toEqual(['a']);
  });

  it('leaves a date that already has an entry alone', () => {
    const plan = planSync({ shifts: [shift('a', '2026-11-01')], items: [], entries: [entry(1, '2026-11-01', '10:00', '12:00', null)], today: TODAY });
    expect(plan.create).toEqual([]);
    expect(plan.markSeen.map((s) => s.uid)).toEqual(['a']);
  });

  it('follows a moved shift while the entry is untouched', () => {
    const plan = planSync({
      shifts: [shift('a', '2026-11-02', '12:00', '20:00')],
      items: [item('a', '2026-11-01', 1)],
      entries: [entry(1, '2026-11-01')],
      today: TODAY,
    });
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].shift.date).toBe('2026-11-02');
  });

  it('follows a new department list', () => {
    const plan = planSync({
      shifts: [shift('a', '2026-11-01', '08:00', '16:00', ['Kassa', 'Plock'])],
      items: [item('a', '2026-11-01', 1)],
      entries: [entry(1, '2026-11-01')],
      today: TODAY,
    });
    expect(plan.update).toHaveLength(1);
  });

  it('never overwrites an entry the user edited', () => {
    const plan = planSync({
      shifts: [shift('a', '2026-11-01', '12:00', '20:00')],
      items: [item('a', '2026-11-01', 1)],
      entries: [entry(1, '2026-11-01', '08:00', '16:30')],
      today: TODAY,
    });
    expect(plan.update).toEqual([]);
  });

  it('does not recreate an entry the user deleted', () => {
    const plan = planSync({ shifts: [shift('a', '2026-11-01')], items: [item('a', '2026-11-01', 1)], entries: [], today: TODAY });
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([]);
  });

  it('removes an untouched future entry whose shift left the feed, never a past or edited one', () => {
    const plan = planSync({
      shifts: [shift('keep', '2026-11-05')],
      items: [
        item('gone', '2026-11-01', 1),
        item('past', '2026-10-20', 2),
        item('edited', '2026-11-02', 3),
        item('keep', '2026-11-05', 4),
      ],
      entries: [entry(1, '2026-11-01'), entry(2, '2026-10-20'), entry(3, '2026-11-02', '08:00', '17:00'), entry(4, '2026-11-05')],
      today: TODAY,
    });
    expect(plan.remove.map((i) => i.uid)).toEqual(['gone']);
  });

  it('removes nothing when the feed comes back empty', () => {
    const plan = planSync({ shifts: [], items: [item('a', '2026-11-01', 1)], entries: [entry(1, '2026-11-01')], today: TODAY });
    expect(plan.remove).toEqual([]);
  });

  it('creates both shifts of a split day', () => {
    const plan = planSync({ shifts: [shift('a', '2026-11-01', '08:00', '12:00'), shift('b', '2026-11-01', '16:00', '20:00')], items: [], entries: [], today: TODAY });
    expect(plan.create.map((s) => s.uid)).toEqual(['a', 'b']);
  });

  it('adds a second shift later to a date whose only entry the sync made', () => {
    const plan = planSync({
      shifts: [shift('a', '2026-11-01', '08:00', '12:00'), shift('b', '2026-11-01', '16:00', '20:00')],
      items: [item('a', '2026-11-01', 1, '08:00', '12:00')],
      entries: [entry(1, '2026-11-01', '08:00', '12:00')],
      today: TODAY,
    });
    expect(plan.create.map((s) => s.uid)).toEqual(['b']);
  });

  it('never creates a shift that overlaps one already there', () => {
    const plan = planSync({
      shifts: [shift('a', '2026-11-01', '08:00', '12:00'), shift('b', '2026-11-01', '11:00', '15:00'), shift('c', '2026-11-02', '22:00', '06:00'), shift('d', '2026-11-02', '23:00', '01:00')],
      items: [], entries: [], today: TODAY,
    });
    expect(plan.create.map((s) => s.uid)).toEqual(['a', 'c']);
    expect(plan.markSeen.map((s) => s.uid)).toEqual(['b', 'd']);
  });

  it('adds nothing to a date with an entry the user made, even beside a synced one', () => {
    const plan = planSync({
      shifts: [shift('a', '2026-11-01', '08:00', '12:00'), shift('b', '2026-11-01', '16:00', '20:00')],
      items: [item('a', '2026-11-01', 1, '08:00', '12:00')],
      entries: [entry(1, '2026-11-01', '08:00', '12:00'), entry(2, '2026-11-01', '13:00', '14:00', null)],
      today: TODAY,
    });
    expect(plan.create).toEqual([]);
    expect(plan.markSeen.map((s) => s.uid)).toEqual(['b']);
  });
});
