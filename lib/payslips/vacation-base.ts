import type { Payslip } from '@/lib/db/schema';
import { workMonthFor } from './files';

type VacationBaseFields = Pick<Payslip, 'grossPay' | 'vacationPay' | 'vacationDaysPay'>;

/**
 * The vacation-pay base a payslip shows for its work month: gross minus the
 * vacation money already in it (13 % paid out with the salary, and pay for
 * vacation days taken). Neither of those earns new vacation pay. Null when the
 * payslip has no gross filled in — then it says nothing about the month.
 */
export function payslipVacationBase(p: VacationBaseFields): number | null {
  if (p.grossPay == null) return null;
  return p.grossPay - (p.vacationPay ?? 0) - (p.vacationDaysPay ?? 0);
}

/**
 * Vacation-pay base per work month, from the payslips that have a gross.
 * A payout month's payslip covers the month before (workMonthFor). When the
 * same payout month was uploaded twice, the newest upload (highest id) wins.
 */
export function payslipBasesByWorkMonth(
  slips: (VacationBaseFields & Pick<Payslip, 'id' | 'payMonth'>)[]
): Map<string, number> {
  const newest = new Map<string, (typeof slips)[number]>();
  for (const s of slips) {
    if (payslipVacationBase(s) == null) continue;
    const prev = newest.get(s.payMonth);
    if (!prev || s.id > prev.id) newest.set(s.payMonth, s);
  }
  const bases = new Map<string, number>();
  for (const [payMonth, s] of newest) bases.set(workMonthFor(payMonth), payslipVacationBase(s)!);
  return bases;
}
