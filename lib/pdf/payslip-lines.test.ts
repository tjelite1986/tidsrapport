import { describe, it, expect } from 'vitest';
import { buildPayslipLines, roundedNetPay, type PayslipLineSource } from './payslip-lines';

/** A month with nothing but ordinary hours; each test overrides what it needs. */
function source(overrides: Partial<PayslipLineSource> = {}): PayslipLineSource {
  const base: PayslipLineSource = {
    workMonth: '2026-02',
    workHours: 100,
    basePay: 16000,
    obBreakdown: [],
    overtidMertid: 0,
    overtidEnkel: 0,
    overtidKvalificerad: 0,
    overtimeHours: { mertid: 0, enkel: 0, kvalificerad: 0 },
    sickHours: 0,
    sickPay: 0,
    vacationDaysCount: 0,
    vacationDaysPay: 0,
    vacationPay: 0,
    vacationPayRate: 12,
    vacationPayInGross: false,
    grossPay: 16000,
    tax: 4800,
    netPay: 11200,
  };
  return { ...base, ...overrides };
}

const sum = (lines: { amount: number }[]) => lines.reduce((total, line) => total + line.amount, 0);

describe('buildPayslipLines', () => {
  it('names the base row after the work month, not the payout month', () => {
    const [first] = buildPayslipLines(source());
    expect(first.art).toBe('10');
    expect(first.text).toBe('Timlön Februari');
    expect(first.quantity).toBe(100);
    expect(first.unitPrice).toBe(160);
  });

  it('adds up to the payout, öresutjämning included', () => {
    const lines = buildPayslipLines(
      source({ grossPay: 24568.42, tax: 4791, netPay: 19777.42, basePay: 24568.42, workHours: 126.71 }),
    );
    expect(sum(lines)).toBeCloseTo(19777, 6);
    expect(lines.at(-1)).toMatchObject({ art: '996', text: 'Öresutjämning' });
    expect(lines.at(-1)!.amount).toBeCloseTo(-0.42, 6);
  });

  it('leaves out the öresutjämning row when the net is already whole kronor', () => {
    const lines = buildPayslipLines(source({ netPay: 11200 }));
    expect(lines.some((l) => l.art === '996')).toBe(false);
  });

  it('moves the overtime hours off the Timlön row so the rows still sum to base + supplement', () => {
    const lines = buildPayslipLines(
      source({
        workHours: 100,
        basePay: 16000,
        overtidMertid: 560, // 10 h x 160 kr x 35%
        overtimeHours: { mertid: 10, enkel: 0, kvalificerad: 0 },
        grossPay: 16560,
        tax: 0,
        netPay: 16560,
      }),
    );
    const hourly = lines.find((l) => l.art === '10')!;
    const mertid = lines.find((l) => l.art === '316')!;
    expect(hourly.quantity).toBe(90);
    expect(hourly.amount).toBeCloseTo(14400, 6);
    expect(mertid.quantity).toBe(10);
    expect(mertid.amount).toBeCloseTo(2160, 6); // 10 x 160 + 560
    expect(mertid.unitPrice).toBeCloseTo(216, 6);
    expect(sum(lines)).toBeCloseTo(16560, 6);
  });

  it('gives each OB percentage its own article number', () => {
    const lines = buildPayslipLines(
      source({
        obBreakdown: [
          { percent: 50, hours: 7, amount: 570.43 },
          { percent: 70, hours: 0.15, amount: 17.11 },
          { percent: 100, hours: 20.43, amount: 3329.68 },
          { percent: 40, hours: 2, amount: 130 },
        ],
      }),
    );
    expect(lines.filter((l) => l.text.startsWith('OB')).map((l) => l.art)).toEqual(['411', '412', '413', '410']);
  });

  it('keeps vacation pay out of the rows when it goes to the pot', () => {
    const toPot = buildPayslipLines(source({ vacationPay: 1920, vacationPayInGross: false }));
    expect(toPot.some((l) => l.art === '612')).toBe(false);

    const inSalary = buildPayslipLines(
      source({ vacationPay: 1920, vacationPayInGross: true, grossPay: 17920, tax: 5376, netPay: 12544 }),
    );
    expect(inSalary.find((l) => l.art === '612')).toMatchObject({
      text: 'Semesterersättning 12%',
      amount: 1920,
    });
    expect(sum(inSalary)).toBeCloseTo(12544, 6);
  });

  it('prints vacation days in Dgr with the per-day rate', () => {
    const lines = buildPayslipLines(
      source({ vacationDaysCount: 5, vacationDaysPay: 6000, grossPay: 22000, tax: 6600, netPay: 15400 }),
    );
    expect(lines.find((l) => l.art === '611')).toMatchObject({
      text: 'Semesterlön betald',
      quantity: 5,
      unit: 'Dgr',
      unitPrice: 1200,
    });
  });

  it('drops the rate columns for a fixed monthly salary', () => {
    const lines = buildPayslipLines(
      source({ fixedSalary: true, basePay: 28000, workHours: 160, grossPay: 28000, tax: 8400, netPay: 19600 }),
    );
    const first = lines[0];
    expect(first.text).toBe('Månadslön Februari');
    expect(first.quantity).toBeNull();
    expect(first.unitPrice).toBeNull();
    expect(sum(lines)).toBeCloseTo(19600, 6);
  });
});

describe('roundedNetPay', () => {
  it('rounds to whole kronor', () => {
    expect(roundedNetPay(19777.42)).toBe(19777);
    expect(roundedNetPay(19777.62)).toBe(19778);
  });
});
