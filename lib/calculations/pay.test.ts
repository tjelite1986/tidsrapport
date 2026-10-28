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
    expect(r.sickHours).toBe(16);
    expect(r.karensHours).toBe(8);
    expect(r.paidSickHours).toBe(8);
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

describe('per-shift hourly-rate override', () => {
  const history: PaySettings = {
    ...base,
    hourlyRate: 168.73,
    rateHistory: [{ effectiveFrom: '2026-06-01', hourlyRate: 175.64 }],
  };
  const withRate = (e: TimeEntryForPay, rate: number | null | undefined): TimeEntryForPay => ({ ...e, hourlyRateOverride: rate });

  it('leaves an entry without an override exactly as before', () => {
    const plain = calculateMonthlyPay([entry('2026-06-10')], history);
    const nulled = calculateMonthlyPay([withRate(entry('2026-06-10'), null)], history);
    expect(nulled.basePay).toBe(plain.basePay);
    expect(nulled.basePay).toBeCloseTo(8 * 175.64, 5);
    expect(nulled.days[0].rateOverridden).toBe(false);
    expect(nulled.days[0].hourlyRate).toBeCloseTo(175.64, 5);
  });

  it('pays only the overridden shift at its own rate, over the rate history', () => {
    const r = calculateMonthlyPay([entry('2026-06-10'), withRate(entry('2026-06-11'), 210)], history);
    expect(r.basePay).toBeCloseTo(8 * 175.64 + 8 * 210, 5);
    expect(r.days.map((d) => d.rateOverridden)).toEqual([false, true]);
    expect(r.days[1].hourlyRate).toBe(210);
    // The display rate is the normal rate, not the override
    expect(r.hourlyRate).toBeCloseTo(175.64, 5);
  });

  it('applies the override to overtime and sick pay too', () => {
    const ot = calculateMonthlyPay([withRate(entry('2026-06-10', 'work', 'kvalificerad'), 200)], history);
    expect(ot.overtidKvalificerad).toBeCloseTo(200 * 8 * 0.7, 5);
    const sick = calculateMonthlyPay(
      [withRate(entry('2026-06-10', 'sick'), 200), withRate(entry('2026-06-11', 'sick'), 200)],
      history,
    );
    expect(sick.sickPay).toBeCloseTo(200 * 8 * 0.8, 5); // day 1 is karens
  });

  it('applies the override to OB', () => {
    const butik: PaySettings = { ...history, workplaceType: 'butik' };
    const shift = (rate?: number): TimeEntryForPay => ({
      ...entry('2026-06-10'),
      hours: 2,
      startTime: '20:00',
      endTime: '22:00',
      hourlyRateOverride: rate,
    });
    const normal = calculateMonthlyPay([shift()], butik).totalOB;
    const own = calculateMonthlyPay([shift(200)], butik).totalOB;
    expect(normal).toBeGreaterThan(0);
    expect(own / normal).toBeCloseTo(200 / 175.64, 5);
  });

  it('in fixed_plus mode keeps the fixed base pay but uses the override for overtime', () => {
    const fixed: PaySettings = { ...base, salaryMode: 'fixed_plus', fixedMonthlySalary: 32000, workingHoursPerMonth: 160 };
    const r = calculateMonthlyPay([withRate(entry('2026-06-10', 'work', 'enkel'), 250)], fixed);
    expect(r.basePay).toBe(32000);
    expect(r.overtidEnkel).toBeCloseTo(250 * 8 * 0.35, 5);
  });
});
