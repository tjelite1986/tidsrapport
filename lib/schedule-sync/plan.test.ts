import { describe, expect, it } from 'vitest';
import { pairReplacedShifts, planSync, type EntryRef, type SyncItem, type SyncShift } from './plan';

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

  it('does not put a new shift on a vacation day', () => {
    const plan = planSync({
      shifts: [shift('a', '2026-11-01'), shift('b', '2026-11-02')],
      items: [],
      entries: [],
      today: TODAY,
      vacationDates: ['2026-11-01'],
    });
    expect(plan.create.map((s) => s.uid)).toEqual(['b']);
    expect(plan.markSeen.map((s) => s.uid)).toEqual(['a']);
  });

  it('does not move a synced entry onto a vacation day, but still follows new times on its own date', () => {
    const plan = planSync({
      shifts: [shift('a', '2026-11-02'), shift('b', '2026-11-03', '10:00', '18:00')],
      items: [item('a', '2026-11-01', 1), item('b', '2026-11-03', 2)],
      entries: [entry(1, '2026-11-01'), entry(2, '2026-11-03')],
      today: TODAY,
      vacationDates: ['2026-11-02', '2026-11-03'],
    });
    expect(plan.update.map((u) => u.item.uid)).toEqual(['b']);
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

  it('adopts a work entry made by hand that has the shift\'s last times, once the shift changes', () => {
    const plan = planSync({
      shifts: [shift('a', '2026-10-27', '06:00', '15:00')],
      items: [item('a', '2026-10-27', null, '06:00', '10:15')],
      entries: [entry(588, '2026-10-27', '06:00', '10:15', null)],
      today: '2026-10-27',
    });
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].item.entryId).toBe(588);
    expect(plan.update[0].shift.endTime).toBe('15:00');
  });

  it('does not adopt an entry while the shift is unchanged, nor one with other times, a sick day or a past date', () => {
    const unchanged = planSync({
      shifts: [shift('a', '2026-11-01')],
      items: [item('a', '2026-11-01', null)],
      entries: [entry(1, '2026-11-01', '08:00', '16:00', null)],
      today: TODAY,
    });
    expect(unchanged.update).toEqual([]);

    const edited = planSync({
      shifts: [shift('a', '2026-11-01', '08:00', '18:00')],
      items: [item('a', '2026-11-01', null)],
      entries: [entry(1, '2026-11-01', '08:00', '16:30', null)],
      today: TODAY,
    });
    expect(edited.update).toEqual([]);

    const sick = planSync({
      shifts: [shift('a', '2026-11-01', '08:00', '18:00')],
      items: [item('a', '2026-11-01', null)],
      entries: [{ ...entry(1, '2026-11-01'), entryType: 'sick' }],
      today: TODAY,
    });
    expect(sick.update).toEqual([]);

    const past = planSync({
      shifts: [shift('a', '2026-10-20', '08:00', '18:00')],
      items: [item('a', '2026-10-20', null)],
      entries: [entry(1, '2026-10-20')],
      today: TODAY,
    });
    expect(past.update).toEqual([]);
  });
});

describe('pairReplacedShifts', () => {
  it('pairs the one shift that left a date with the one that arrived on it', () => {
    const pairs = pairReplacedShifts({
      shifts: [shift('new', '2026-10-27', '06:00', '15:00'), shift('b', '2026-10-28')],
      items: [item('old', '2026-10-27', 588, '06:00', '10:15'), item('b', '2026-10-28', 2)],
      today: '2026-10-27',
    });
    expect([...pairs]).toEqual([['new', 'old']]);
  });

  it('leaves ambiguous, past, already-reported and outage cases unpaired', () => {
    const ambiguous = pairReplacedShifts({
      shifts: [shift('n1', '2026-11-01', '08:00', '12:00'), shift('n2', '2026-11-01', '13:00', '17:00')],
      items: [item('old', '2026-11-01', 1)],
      today: TODAY,
    });
    expect(ambiguous.size).toBe(0);

    const past = pairReplacedShifts({ shifts: [shift('n', '2026-10-20')], items: [item('old', '2026-10-20', 1)], today: TODAY });
    expect(past.size).toBe(0);

    const reported = pairReplacedShifts({
      shifts: [shift('n', '2026-11-01')],
      items: [{ ...item('old', '2026-11-01', 1), gone: 1 }],
      today: TODAY,
    });
    expect(reported.size).toBe(0);

    expect(pairReplacedShifts({ shifts: [], items: [item('old', '2026-11-01', 1)], today: TODAY }).size).toBe(0);
  });
});
