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
  const settings: PaySettings = { ...base, hourlyRate: 100 };
  const sickPay80 = 100 * 8 * 0.8; // 640

  it('pays 0 for the first day (karens) and 80% from day 2', () => {
    const r = calculateMonthlyPay(
      [entry('2026-06-01', 'sick'), entry('2026-06-02', 'sick')],
      settings,
    );
    const sick = r.days.filter((d) => d.entryType === 'sick');
    expect(sick[0].sickPay).toBe(0); // karensdag
    expect(sick[1].sickPay).toBeCloseTo(sickPay80, 5);
  });

  it('continues the period over a weekend (återinsjuknande within 5 days)', () => {
    // Sick Friday, sick again Monday — same period, Monday pays 80%
    const r = calculateMonthlyPay(
      [entry('2026-06-05', 'sick'), entry('2026-06-08', 'sick')],
      settings,
    );
    const sick = r.days.filter((d) => d.entryType === 'sick');
    expect(sick[0].sickPay).toBe(0);
    expect(sick[1].sickPay).toBeCloseTo(sickPay80, 5);
  });

  it('is not reset by a work day within the 5-day window', () => {
    const r = calculateMonthlyPay(
      [entry('2026-06-01', 'sick'), entry('2026-06-02', 'work'), entry('2026-06-03', 'sick')],
      settings,
    );
    const sick = r.days.filter((d) => d.entryType === 'sick');
    expect(sick[1].sickPay).toBeCloseTo(sickPay80, 5);
  });

  it('is not reset by a VAB day (neutral)', () => {
    const r = calculateMonthlyPay(
      [entry('2026-06-01', 'sick'), entry('2026-06-02', 'vab'), entry('2026-06-03', 'sick')],
      settings,
    );
    const sick = r.days.filter((d) => d.entryType === 'sick');
    expect(sick[1].sickPay).toBeCloseTo(sickPay80, 5);
  });

  it('starts a new period (new karens) after a gap of more than 5 days', () => {
    const r = calculateMonthlyPay(
      [entry('2026-06-01', 'sick'), entry('2026-06-08', 'sick')], // gap = 7 days
      settings,
    );
    const sick = r.days.filter((d) => d.entryType === 'sick');
    expect(sick[0].sickPay).toBe(0);
    expect(sick[1].sickPay).toBe(0); // new karensdag
  });
});

describe('butik OB/overtime exclusivity', () => {
  it('drops the day\'s OB from the breakdown when overtime wins', () => {
    // Wed 17:00-21:00 @ 100 kr: OB = 1.75h@50% + 1h@70% = 157.50, kvalificerad = 4h*0.7*100 = 280
    const settings: PaySettings = { ...base, workplaceType: 'butik', hourlyRate: 100 };
    const e: TimeEntryForPay = {
      date: '2026-06-03', hours: 4, startTime: '17:00', endTime: '21:00',
      breakMinutes: 0, entryType: 'work', overtimeType: 'kvalificerad',
    };
    const r = calculateMonthlyPay([e], settings);
    expect(r.overtidKvalificerad).toBeCloseTo(280, 5);
    expect(r.totalOB).toBeCloseTo(0, 5);
    expect(r.obBreakdown).toEqual([]); // payslip rows must sum to gross
    expect(r.days[0].obResult).toBeNull();
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
