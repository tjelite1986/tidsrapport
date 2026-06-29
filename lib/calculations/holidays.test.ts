import { describe, it, expect } from 'vitest';
import { getHolidays, isRedDay, isHalfDay, isDayBeforeRedDay } from './holidays';

describe('getHolidays', () => {
  it('computes Easter-derived holidays for 2026', () => {
    const h = getHolidays(2026);
    const byName = (name: string) => h.find((x) => x.name === name)?.date;
    expect(byName('Påskdagen')).toBe('2026-04-05'); // Western Easter 2026
    expect(byName('Långfredagen')).toBe('2026-04-03');
    expect(byName('Annandag påsk')).toBe('2026-04-06');
    expect(byName('Kristi himmelsfärdsdag')).toBe('2026-05-14'); // Easter + 39
  });

  it('includes the fixed holidays', () => {
    const dates = getHolidays(2026).map((x) => x.date);
    expect(dates).toContain('2026-01-01'); // Nyårsdagen
    expect(dates).toContain('2026-06-06'); // Nationaldagen
    expect(dates).toContain('2026-12-25'); // Juldagen
  });

  it('memoizes per year (returns the same array reference)', () => {
    expect(getHolidays(2026)).toBe(getHolidays(2026));
  });
});

describe('isRedDay', () => {
  it('is true for full holidays and Sundays, false for regular weekdays', () => {
    expect(isRedDay('2026-01-01')).toBe(true); // Nyårsdagen
    expect(isRedDay('2026-04-05')).toBe(true); // Påskdagen (also a Sunday)
    expect(isRedDay('2026-02-08')).toBe(true); // a plain Sunday
    expect(isRedDay('2026-02-03')).toBe(false); // a Tuesday
  });

  it('does not treat half-days (Julafton) as full red days', () => {
    expect(isRedDay('2026-12-24')).toBe(false);
  });
});

describe('isHalfDay', () => {
  it('flags Julafton and Nyårsafton', () => {
    expect(isHalfDay('2026-12-24')).toBe(true);
    expect(isHalfDay('2026-12-31')).toBe(true);
    expect(isHalfDay('2026-02-03')).toBe(false);
  });
});

describe('isDayBeforeRedDay', () => {
  it('detects the day before a red day, including across a year boundary', () => {
    // 2025-12-31 → next day 2026-01-01 (Nyårsdagen). Regression guard for the
    // former toISOString() UTC shift that could move this off-by-a-day.
    expect(isDayBeforeRedDay('2025-12-31')).toBe(true);
    expect(isDayBeforeRedDay('2026-01-05')).toBe(true); // → Trettondedag jul 01-06
    expect(isDayBeforeRedDay('2026-02-10')).toBe(false); // → a plain Wednesday
  });
});
