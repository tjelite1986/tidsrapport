import { describe, it, expect } from 'vitest';
import { isPaidVacationDay, countPaidVacationDays } from './vacation';

function range(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cur <= end) {
    out.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    );
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

describe('isPaidVacationDay', () => {
  it('counts weekdays', () => {
    expect(isPaidVacationDay('2026-06-01')).toBe(true); // Monday
    expect(isPaidVacationDay('2026-06-05')).toBe(true); // Friday
  });

  it('does not count Saturday or Sunday', () => {
    expect(isPaidVacationDay('2026-06-06')).toBe(false); // Saturday
    expect(isPaidVacationDay('2026-06-07')).toBe(false); // Sunday
  });
});

describe('countPaidVacationDays', () => {
  // Payslip 2026-07: "611 Semesterlön betald  5,00 Dgr  2026-06-01--2026-06-07"
  it('charges 5 days for a Mon–Sun week', () => {
    expect(countPaidVacationDays(range('2026-06-01', '2026-06-07'))).toBe(5);
  });

  // Payslip 2026-08: "611 Semesterlön betald  5,00 Dgr  2026-07-16--2026-07-22"
  it('charges 5 days for a week that starts mid-week', () => {
    expect(countPaidVacationDays(range('2026-07-16', '2026-07-22'))).toBe(5);
  });

  it('charges nothing for a weekend-only period', () => {
    expect(countPaidVacationDays(range('2026-06-06', '2026-06-07'))).toBe(0);
  });

  it('charges 10 days for two full weeks', () => {
    expect(countPaidVacationDays(range('2026-06-01', '2026-06-14'))).toBe(10);
  });
});
