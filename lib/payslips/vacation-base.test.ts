import { describe, it, expect } from 'vitest';
import { payslipBasesByWorkMonth, payslipVacationBase } from './vacation-base';

const slip = (id: number, payMonth: string, grossPay: number | null, vacationPay: number | null = null, vacationDaysPay: number | null = null) => ({
  id,
  payMonth,
  grossPay,
  vacationPay,
  vacationDaysPay,
});

describe('payslipVacationBase', () => {
  it('takes the 13 % paid out with the salary off the gross (Biltema, Löneperiod 2025-07)', () => {
    // Gross 19 969,08 includes 622 Semesterersättning 13% 2 297,33.
    expect(payslipVacationBase(slip(1, '2025-07', 19969.08, 2297.33))).toBeCloseTo(17671.75, 2);
  });

  it('takes pay for vacation days taken off the gross (Biltema, Löneperiod 2026-07)', () => {
    // Gross 31 743,25 includes 611 Semesterlön betald 5 Dgr x 1 333,81.
    expect(payslipVacationBase(slip(1, '2026-07', 31743.25, null, 6669.05))).toBeCloseTo(25074.2, 2);
  });

  it('is the gross when the payslip holds no vacation money (Biltema, Löneperiod 2025-08)', () => {
    const base = payslipVacationBase(slip(1, '2025-08', 24398.11))!;
    expect(base).toBe(24398.11);
    expect(base * 0.13).toBeCloseTo(3171.75, 2);
  });

  it('says nothing without a gross', () => {
    expect(payslipVacationBase(slip(1, '2025-08', null, 100))).toBeNull();
  });
});

describe('payslipBasesByWorkMonth', () => {
  it('keys each payslip on the work month before its payout month', () => {
    const bases = payslipBasesByWorkMonth([slip(1, '2026-01', 28393.48), slip(2, '2025-08', 24398.11)]);
    expect([...bases.keys()].sort()).toEqual(['2025-07', '2025-12']);
    expect(bases.get('2025-12')).toBe(28393.48);
  });

  it('uses the newest upload when a payout month was uploaded twice', () => {
    const bases = payslipBasesByWorkMonth([slip(7, '2025-08', 24398.11), slip(3, '2025-08', 20000)]);
    expect(bases.get('2025-07')).toBe(24398.11);
  });

  it('skips a payslip without a gross rather than letting it hide the month', () => {
    const bases = payslipBasesByWorkMonth([slip(9, '2025-08', null), slip(3, '2025-08', 24398.11)]);
    expect(bases.get('2025-07')).toBe(24398.11);
  });
});
