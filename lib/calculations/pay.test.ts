import { describe, it, expect } from 'vitest';
import { calculateMonthlyPay, type PaySettings, type TimeEntryForPay } from './pay';

const base: PaySettings = {
  workplaceType: 'none', // isolate rate/entry-type logic from OB
  contractLevel: '2ar',
  taxRate: 30,
  vacationPayRate: 12,
  vacationPayMode: 'included',
  salaryMode: 'hourly',
};

function entry(date: string, entryType = 'work', over = 'none'): TimeEntryForPay {
  return { date, hours: 8, startTime: null, endTime: null, breakMinutes: 0, entryType, overtimeType: over };
}

describe('date-effective hourly-rate history', () => {
  const settings: PaySettings = {
    ...base,
    rateHistory: [
      { effectiveFrom: '2000-01-01', hourlyRate: 162.98 },
      { effectiveFrom: '2026-05-01', hourlyRate: 168.73 },
      { effectiveFrom: '2026-06-01', hourlyRate: 175.64 },
    ],
  };
  const rateFor = (date: string) => calculateMonthlyPay([entry(date)], settings).basePay / 8;

  it('pays each entry at the rate effective on its date', () => {
    expect(rateFor('2026-04-30')).toBeCloseTo(162.98, 5);
    expect(rateFor('2026-05-01')).toBeCloseTo(168.73, 5);
    expect(rateFor('2026-05-31')).toBeCloseTo(168.73, 5);
    expect(rateFor('2026-06-01')).toBeCloseTo(175.64, 5);
  });

  it('floors to the earliest row for dates before all entries', () => {
    expect(rateFor('1999-12-31')).toBeCloseTo(162.98, 5);
  });

  it('falls back to the flat customHourlyRate when no history is present', () => {
    const flat: PaySettings = { ...base, hourlyRate: 168.73 };
    expect(calculateMonthlyPay([entry('2026-06-01')], flat).basePay / 8).toBeCloseTo(168.73, 5);
  });
});

describe('VAB entry type', () => {
  it('pays 0 kr (employer) and is excluded from work hours', () => {
    const settings: PaySettings = { ...base, hourlyRate: 175 };
    const r = calculateMonthlyPay(
      [entry('2026-06-01', 'work'), entry('2026-06-02', 'vab'), entry('2026-06-03', 'work')],
      settings,
    );
    expect(r.workHours).toBe(16); // two work days only
    expect(r.totalHours).toBe(24); // VAB hours still counted as logged time
    expect(r.basePay).toBeCloseTo(16 * 175, 5);
    const vab = r.days.find((d) => d.date === '2026-06-02')!;
    expect(vab.basePay).toBe(0);
    expect(vab.overtimePay).toBe(0);
    expect(vab.sickPay).toBe(0);
    expect(vab.obResult).toBeNull();
  });
});

describe('sick day karens', () => {
  it('pays 0 for the first day (karens) and 80% from day 2', () => {
    const settings: PaySettings = { ...base, hourlyRate: 100 };
    const r = calculateMonthlyPay(
      [entry('2026-06-01', 'sick'), entry('2026-06-02', 'sick')],
      settings,
    );
    const sick = r.days.filter((d) => d.entryType === 'sick');
    expect(sick[0].sickPay).toBe(0); // karensdag
    expect(sick[1].sickPay).toBeCloseTo(100 * 8 * 0.8, 5); // 640
  });
});

describe('overtime multipliers', () => {
  const settings: PaySettings = { ...base, hourlyRate: 100 };
  it('mertid and enkel add 35%, kvalificerad adds 70%', () => {
    expect(calculateMonthlyPay([entry('2026-06-01', 'work', 'mertid')], settings).overtidMertid)
      .toBeCloseTo(100 * 8 * 0.35, 5);
    expect(calculateMonthlyPay([entry('2026-06-01', 'work', 'kvalificerad')], settings).overtidKvalificerad)
      .toBeCloseTo(100 * 8 * 0.7, 5);
  });
});
