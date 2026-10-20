import { describe, expect, it } from 'vitest';
import { occurrencesInRange, type RecurringRule } from './recurrence';

const rule = (r: Partial<RecurringRule>): RecurringRule => ({
  date: '2026-10-20', recurrence: 'weekly', recurrenceUntil: null, excludedDates: [], ...r,
});

describe('occurrencesInRange', () => {
  it('returns a one-off event only inside the window', () => {
    expect(occurrencesInRange(rule({ recurrence: 'none' }), '2026-10-01', '2026-10-31')).toEqual(['2026-10-20']);
    expect(occurrencesInRange(rule({ recurrence: 'none' }), '2026-11-01', '2026-11-30')).toEqual([]);
  });

  it('repeats weekly from the first date, never before it', () => {
    expect(occurrencesInRange(rule({}), '2026-10-01', '2026-11-10')).toEqual([
      '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10',
    ]);
  });

  it('keeps the weekday across the DST change in late October', () => {
    expect(occurrencesInRange(rule({ date: '2026-10-19' }), '2026-10-26', '2026-11-02')).toEqual(['2026-10-26', '2026-11-02']);
  });

  it('finds the right biweekly phase in a window far from the start', () => {
    expect(occurrencesInRange(rule({ recurrence: 'biweekly' }), '2027-03-01', '2027-03-31')).toEqual(['2027-03-09', '2027-03-23']);
  });

  it('repeats daily', () => {
    expect(occurrencesInRange(rule({ recurrence: 'daily' }), '2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02',
    ]);
  });

  it('skips months that lack the day for a monthly event on the 31st', () => {
    expect(occurrencesInRange(rule({ recurrence: 'monthly', date: '2026-01-31' }), '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31', '2026-03-31', '2026-05-31',
    ]);
  });

  it('stops at the end date and leaves out removed occurrences', () => {
    expect(occurrencesInRange(
      rule({ recurrenceUntil: '2026-11-03', excludedDates: ['2026-10-27'] }),
      '2026-10-01', '2026-12-31',
    )).toEqual(['2026-10-20', '2026-11-03']);
  });
});
