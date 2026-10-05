import { describe, it, expect } from 'vitest';
import { buildComparison, parseObLines, readObLines, serializeObLines } from './fields';

describe('parseObLines', () => {
  it('parses a JSON string with Swedish-formatted numbers', () => {
    expect(parseObLines('[{"percent":"50","hours":"12,25","amount":"1 076,00"}]')).toEqual([
      { percent: 50, hours: 12.25, amount: 1076 },
    ]);
  });

  it('sorts by percentage and drops lines with neither hours nor amount', () => {
    const lines = parseObLines([
      { percent: 100, hours: 4, amount: 700 },
      { percent: 50, hours: null, amount: 300 },
      { percent: 70, hours: '', amount: '' },
    ]);
    expect(lines).toEqual([
      { percent: 50, hours: null, amount: 300 },
      { percent: 100, hours: 4, amount: 700 },
    ]);
  });

  it('reads blank input as "nothing stored"', () => {
    expect(parseObLines(null)).toBeNull();
    expect(parseObLines('')).toBeNull();
    expect(parseObLines('[]')).toBeNull();
    expect(parseObLines([{ percent: 50, hours: '', amount: '' }])).toBeNull();
  });

  it('rejects malformed input instead of silently dropping it', () => {
    expect(parseObLines('not json')).toBeUndefined();
    expect(parseObLines('{"percent":50}')).toBeUndefined();
    expect(parseObLines([{ percent: 'femtio', hours: 1, amount: 1 }])).toBeUndefined();
    expect(parseObLines([{ percent: 50, hours: -1, amount: 1 }])).toBeUndefined();
    expect(parseObLines([{ percent: 400, hours: 1, amount: 1 }])).toBeUndefined();
  });

  it('rejects a percentage listed twice — the table would double it', () => {
    expect(
      parseObLines([
        { percent: 50, hours: 2, amount: 100 },
        { percent: 50, hours: 3, amount: 150 },
      ]),
    ).toBeUndefined();
  });

  it('round-trips through the stored column', () => {
    const lines = parseObLines([{ percent: 70, hours: 3, amount: 500 }]);
    expect(readObLines(serializeObLines(lines!))).toEqual(lines);
  });

  it('reads garbage in the column as no lines instead of throwing', () => {
    expect(readObLines('{{')).toEqual([]);
    expect(readObLines(null)).toEqual([]);
    expect(serializeObLines(null)).toBeNull();
  });
});

const SALARY = {
  workHours: 160,
  hourlyRate: 175.64,
  basePay: 28102.4,
  obBreakdown: [
    { percent: 50, hours: 10, amount: 878.2 },
    { percent: 100, hours: 4, amount: 702.56 },
  ],
  totalOB: 1580.76,
  overtidMertid: 0,
  overtidEnkel: 0,
  overtidKvalificerad: 0,
  sickPay: 0,
  vacationPay: 3562.5,
  vacationDaysPay: 0,
  vacationDaysCount: 0,
  grossPay: 29683.16,
  tax: 7420.79,
  netPay: 22262.37,
};

describe('buildComparison', () => {
  const row = {
    grossPay: 29700,
    tax: 7420.79,
    netPay: null,
    basePay: 28102.4,
    totalOB: 1600,
    workHours: 160,
    obLines: JSON.stringify([{ percent: 50, hours: 11, amount: 900 }]),
  };

  it('diffs the spec against the calculation', () => {
    const rows = buildComparison(row, SALARY);
    const gross = rows.find((r) => r.key === 'grossPay')!;
    expect(gross.actual).toBe(29700);
    expect(gross.calculated).toBeCloseTo(29683.16, 2);
    expect(gross.diff).toBeCloseTo(16.84, 2);
  });

  it('has no diff when one side is missing', () => {
    const net = buildComparison(row, SALARY).find((r) => r.key === 'netPay')!;
    expect(net.actual).toBeNull();
    expect(net.diff).toBeNull();
  });

  it('expands OB per percentage, including one side only', () => {
    const rows = buildComparison(row, SALARY);
    const ob50 = rows.find((r) => r.key === 'ob-50-hours')!;
    expect(ob50.actual).toBe(11);
    expect(ob50.calculated).toBe(10);
    expect(ob50.diff).toBe(1);

    // 100% exists only in the calculation, and must still be listed
    const ob100 = rows.find((r) => r.key === 'ob-100-amount')!;
    expect(ob100.actual).toBeNull();
    expect(ob100.calculated).toBeCloseTo(702.56, 2);
  });

  it('folds mertid hours into the spec hours at the plain hourly rate', () => {
    // Payslip 2026-02: 122.83 h on the base-pay line plus 2 811.41 kr mertid at 162.98 kr/h
    const withMertid = { ...row, workHours: 122.83, hourlyRate: 162.98, overtimeMertid: 2811.41 };
    const hours = buildComparison(withMertid, SALARY).find((r) => r.key === 'workHours')!;
    expect(hours.actual).toBeCloseTo(140.08, 2);
    expect(hours.label).toBe('Arbetad tid inkl. mertid');
  });

  it('folds mertid into the spec base pay, and does not diff it twice', () => {
    // Payslip 2026-02: 20 018.83 kr base pay plus 2 811.41 kr mertid
    const withMertid = { ...row, basePay: 20018.83, hourlyRate: 162.98, overtimeMertid: 2811.41 };
    const rows = buildComparison(withMertid, { ...SALARY, basePay: 23415.27 });
    const base = rows.find((r) => r.key === 'basePay')!;
    expect(base.actual).toBeCloseTo(22830.24, 2);
    expect(base.label).toBe('Grundlön inkl. mertid');
    expect(base.diff).toBeCloseTo(-585.03, 2);

    const mertid = rows.find((r) => r.key === 'overtimeMertid')!;
    expect(mertid.actual).toBe(2811.41);
    expect(mertid.diff).toBeNull();
  });

  it('leaves the hours alone without mertid', () => {
    const hours = buildComparison(row, SALARY).find((r) => r.key === 'workHours')!;
    expect(hours.actual).toBe(160);
    expect(hours.label).toBe('Arbetad tid');
  });

  it('compares sick and karens hours', () => {
    const rows = buildComparison(
      { ...row, sickHours: 8, karensHours: 4.75 },
      { ...SALARY, paidSickHours: 8, karensHours: 8 },
    );
    expect(rows.find((r) => r.key === 'sickHours')!.diff).toBe(0);
    expect(rows.find((r) => r.key === 'karensHours')!.diff).toBe(-3.25);
  });

  it('hides rows that are empty on both sides, but keeps gross/tax/net', () => {
    const rows = buildComparison(row, SALARY);
    expect(rows.some((r) => r.key === 'sickPay')).toBe(false);
    expect(rows.some((r) => r.key === 'overtimeMertid')).toBe(false);
    expect(rows.map((r) => r.key)).toEqual(expect.arrayContaining(['grossPay', 'tax', 'netPay']));
  });

  it('treats an OB percentage the calculation never earned as 0 kr', () => {
    const rows = buildComparison({ ...row, obLines: JSON.stringify([{ percent: 70, hours: 2, amount: 250 }]) }, SALARY);
    const ob70 = rows.find((r) => r.key === 'ob-70-amount')!;
    expect(ob70.actual).toBe(250);
    expect(ob70.calculated).toBe(0);
    expect(ob70.diff).toBe(250);
  });

  it('still lists the spec values when the month has no calculation', () => {
    const rows = buildComparison(row, null);
    const gross = rows.find((r) => r.key === 'grossPay')!;
    expect(gross.calculated).toBeNull();
    expect(gross.diff).toBeNull();
    expect(rows.find((r) => r.key === 'ob-50-amount')?.actual).toBe(900);
  });
});
