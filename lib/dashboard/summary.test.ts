import { describe, it, expect } from 'vitest';
import {
  weekRange, monthRange, upcomingShifts, describeShift, recentActivity, weekEarned, earnedState, earnedLabels, sumHours, dayLabel, formatDuration,
  type DashEntry, type PayDay,
} from './summary';

const e = (id: number, date: string, startTime: string | null, endTime: string | null, extra: Partial<DashEntry> = {}): DashEntry => ({
  id, projectName: 'P', date, hours: 8, startTime, endTime, entryType: 'work', description: null, ...extra,
});

// Wednesday 2026-11-18 12:00 local
const now = new Date(2026, 10, 18, 12, 0);

describe('ranges use local dates', () => {
  it('week is Monday–Sunday', () => {
    expect(weekRange(now)).toEqual({ start: '2026-11-16', end: '2026-11-22' });
    expect(weekRange(new Date(2026, 10, 22, 23, 59))).toEqual({ start: '2026-11-16', end: '2026-11-22' }); // Sunday
  });
  it('week may start in the previous month', () => {
    expect(weekRange(new Date(2026, 11, 2))).toEqual({ start: '2026-11-30', end: '2026-12-06' });
  });
  it('month covers first to last day', () => {
    expect(monthRange(new Date(2026, 1, 10))).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
});

describe('upcomingShifts', () => {
  it('drops finished, non-work and time-less entries and sorts soonest first', () => {
    const list = [
      e(1, '2026-11-18', '06:00', '10:00'), // finished
      e(2, '2026-11-20', '08:00', '16:00'),
      e(3, '2026-11-18', '11:00', '15:00'), // ongoing
      e(4, '2026-11-19', '08:00', '16:00', { entryType: 'sick' }),
      e(5, '2026-11-19', null, null),
    ];
    expect(upcomingShifts(list, now).map((s) => s.id)).toEqual([3, 2]);
  });
  it('keeps a night shift that started yesterday and is still running', () => {
    expect(upcomingShifts([e(1, '2026-11-17', '22:00', '13:00')], now)).toHaveLength(1);
  });
  it('respects the limit', () => {
    const list = [1, 2, 3, 4].map((i) => e(i, `2026-11-2${i}`, '08:00', '16:00'));
    expect(upcomingShifts(list, now, 2)).toHaveLength(2);
  });
});

describe('describeShift', () => {
  it('ongoing shift reports progress and time left', () => {
    const s = describeShift(e(1, '2026-11-18', '10:00', '14:00'), now)!;
    expect(s.ongoing).toBe(true);
    expect(s.progress).toBeCloseTo(50);
    expect(s.countdown).toBe('slutar om 2 h');
  });
  it('coming shift counts down and says tomorrow', () => {
    const s = describeShift(e(1, '2026-11-19', '08:00', '16:00'), now)!;
    expect(s).toMatchObject({ ongoing: false, day: 'imorgon', countdown: 'om 20 h' });
  });
  it('finished shift gives null', () => {
    expect(describeShift(e(1, '2026-11-18', '06:00', '10:00'), now)).toBeNull();
  });
});

describe('recentActivity', () => {
  it('excludes future entries, newest first, limited', () => {
    const list = [e(1, '2026-11-10', '08:00', '16:00'), e(2, '2026-11-18', '08:00', '11:00'), e(3, '2026-11-25', '08:00', '16:00'), e(4, '2026-11-12', null, null)];
    expect(recentActivity(list, now, 2).map((x) => x.id)).toEqual([2, 4]);
  });
});

describe('weekEarned', () => {
  const day = (date: string, basePay: number, ob = 0): PayDay => ({ date, basePay, obResult: ob ? { totalOBAmount: ob } : null, overtimePay: 0, sickPay: 0 });
  const days = [day('2026-11-16', 1000, 100), day('2026-11-17', 1000), day('2026-11-18', 1000), day('2026-11-19', 1000)];
  it('excludes today while a shift is still running, and future days', () => {
    const week = [e(1, '2026-11-16', '08:00', '16:00'), e(2, '2026-11-17', '08:00', '16:00'), e(3, '2026-11-18', '11:00', '15:00')];
    expect(weekEarned(days, week, now)).toEqual({ gross: 2100, hours: 16 });
  });
  it('includes today once its shifts are over', () => {
    const week = [e(1, '2026-11-16', '08:00', '16:00'), e(3, '2026-11-18', '06:00', '10:00')];
    expect(weekEarned(days, week, now)).toEqual({ gross: 3100, hours: 16 });
  });
  it('is zero without data', () => {
    expect(weekEarned([], [], now)).toEqual({ gross: 0, hours: 0 });
  });
});

describe('misc', () => {
  it('sumHours optionally stops at a date', () => {
    const list = [e(1, '2026-11-10', null, null, { hours: 2.5 }), e(2, '2026-11-20', null, null, { hours: 4 })];
    expect(sumHours(list)).toBe(6.5);
    expect(sumHours(list, '2026-11-18')).toBe(2.5);
  });
  it('labels days and durations', () => {
    expect(dayLabel('2026-11-18', now)).toBe('idag');
    expect(formatDuration(90)).toBe('1 h 30 min');
    expect(formatDuration(50 * 60)).toBe('2 dagar');
  });
});

describe('earnedState', () => {
  it('errors when the previous-month salary fails even if the others are still loading', () => {
    expect(earnedState(['ready', 'ready', 'error'])).toBe('error');
    expect(earnedState(['loading', 'ready', 'error'])).toBe('error');
  });
  it('is loading until every source is ready, then ready', () => {
    expect(earnedState(['ready', 'loading'])).toBe('loading');
    expect(earnedState(['ready', 'ready', 'ready'])).toBe('ready');
  });
});

describe('earnedLabels / weekEarned for fixed_plus and vacation', () => {
  // fixed_plus: the engine gives basePay 0 per day, so only OB/overtime/sick remain
  const fixedDays: PayDay[] = [
    { date: '2026-11-16', basePay: 0, obResult: { totalOBAmount: 150 }, overtimePay: 0, sickPay: 0 },
    { date: '2026-11-17', basePay: 0, obResult: null, overtimePay: 300, sickPay: 0 },
  ];
  const week = [e(1, '2026-11-16', '08:00', '16:00'), e(2, '2026-11-17', '08:00', '16:00')];

  it('fixed_plus figure is only the extras and is labelled as such', () => {
    expect(weekEarned(fixedDays, week, now).gross).toBe(450);
    const l = earnedLabels('fixed_plus');
    expect(l.heading).not.toMatch(/jobbat ihop/);
    expect(l.note).toMatch(/Uppskattning/);
    expect(l.note).toMatch(/Exkl\. fast månadslön/);
    expect(l.note).toMatch(/semesterlön/);
    expect(l.note).not.toMatch(/grundlön/);
  });

  it('hourly/contract keeps base pay in the figure and says so', () => {
    const days: PayDay[] = [{ date: '2026-11-16', basePay: 1600, obResult: { totalOBAmount: 100 }, overtimePay: 0, sickPay: 0 }];
    expect(weekEarned(days, [week[0]], now).gross).toBe(1700);
    for (const mode of ['hourly', 'contract', undefined] as const) {
      const l = earnedLabels(mode);
      expect(l.note).toMatch(/grundlön/);
      expect(l.note).not.toMatch(/Exkl\. fast månadslön/);
    }
  });

  it('always states that vacation pay is excluded', () => {
    for (const mode of ['hourly', 'contract', 'fixed_plus', undefined] as const) {
      expect(earnedLabels(mode).note).toMatch(/Exkl\..*semesterlön/);
    }
  });

  it('a real vacation day (month-level vacationDaysPay, no per-day pay, no time entry) adds nothing', () => {
    // Shape of the /api/salary contract: vacation is paid per month in vacationDaysPay/vacationDaysCount,
    // while `days` only holds worked days. Wed 2026-11-18 is a vacation day.
    const salary = { vacationDaysPay: 1200, vacationDaysCount: 1, days: fixedDays };
    const entries = [...week]; // vacation days have no time_entries row
    expect(weekEarned(salary.days, entries, now)).toEqual({ gross: 450, hours: 16 });
    // the 1200 kr is never in the figure, and the hero says so
    expect(weekEarned(salary.days, entries, now).gross).not.toBe(450 + salary.vacationDaysPay);
    expect(earnedLabels('fixed_plus').note).toMatch(/Exkl\..*semesterlön/);
    expect(earnedLabels('hourly').note).toMatch(/Exkl\..*semesterlön/);
  });
});
