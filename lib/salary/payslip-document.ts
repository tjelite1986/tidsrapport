import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, userSettings, vacationDays } from '@/lib/db/schema';
import { countPaidVacationDays } from '@/lib/calculations';
import { workMonthFor } from '@/lib/payslips/files';
import { computeMonthlySalary } from './monthly';
import { buildPayslipLines, roundedNetPay, type PayslipLine } from '@/lib/pdf/payslip-lines';

/**
 * Everything the printed lönebesked needs, assembled server side.
 *
 * The slip is keyed on the *payout* month, the same way the employer's own
 * specs are: a slip for 2026-03 pays for the work done in 2026-02
 * (workMonthFor), and its accumulated columns cover the payouts from January
 * of the payout year up to and including this one.
 */
export type PayslipDocument = {
  payMonth: string;
  workMonth: string;
  /** Payroll period as printed in the header — the payout month, not the work month. */
  periodStart: string;
  periodEnd: string;
  payDate: string;
  employer: { name: string; orgNumber: string; address: string; zipCity: string };
  employee: { name: string; number: string; address: string; zipCity: string };
  lines: PayslipLine[];
  message: string;
  bankAccount: string;
  /** Vacation-day balances. Null means the app does not track that column. */
  vacation: {
    paid: number | null;
    saved: number | null;
    advance: number | null;
    unpaid: number | null;
    entitlement: number;
    compBalance: number | null;
  };
  period: { gross: number; benefit: number; tax: number; workHours: number };
  accumulated: { gross: number; benefit: number; tax: number; workHours: number };
  employerFee: number;
  netPay: number;
  payout: number;
};

function lastDayOfMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const day = new Date(year, m, 0).getDate();
  return `${month}-${String(day).padStart(2, '0')}`;
}

/** Payday clamped to a day the month actually has — the 25th of February exists, the 31st does not. */
function payDateFor(month: string, paydayDay: number): string {
  const [year, m] = month.split('-').map(Number);
  const daysInMonth = new Date(year, m, 0).getDate();
  const day = Math.min(Math.max(paydayDay, 1), daysInMonth);
  return `${month}-${String(day).padStart(2, '0')}`;
}

/**
 * The Swedish vacation year runs 1 April - 31 March, so days taken in January
 * still belong to the year that started the previous April.
 */
function vacationYearRange(date: string): { start: string; end: string } {
  const [year, month] = date.split('-').map(Number);
  const startYear = month >= 4 ? year : year - 1;
  return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
}

/** Every payout month of `payMonth`'s year up to and including it. */
function payoutMonthsThisYear(payMonth: string): string[] {
  const [year, month] = payMonth.split('-').map(Number);
  const months: string[] = [];
  for (let m = 1; m <= month; m++) months.push(`${year}-${String(m).padStart(2, '0')}`);
  return months;
}

export function buildPayslipDocument(userId: number, payMonth: string): PayslipDocument | null {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;

  const settings = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  const workMonth = workMonthFor(payMonth);

  const salary = computeMonthlySalary(userId, workMonth);
  if (!salary) return null;

  const vacationPayInGross =
    salary.settings.vacationPayMode === 'included' || Boolean(salary.settings.includeVacationInSalary);

  const lines = buildPayslipLines({
    workMonth,
    workHours: salary.workHours,
    basePay: salary.basePay,
    obBreakdown: salary.obBreakdown,
    overtidMertid: salary.overtidMertid,
    overtidEnkel: salary.overtidEnkel,
    overtidKvalificerad: salary.overtidKvalificerad,
    overtimeHours: salary.overtimeHours,
    sickHours: salary.sickHours,
    sickPay: salary.sickPay,
    vacationDaysCount: salary.vacationDaysCount,
    vacationDaysPay: salary.vacationDaysPay,
    vacationPay: salary.vacationPay,
    vacationPayRate: salary.settings.vacationPayRate,
    vacationPayInGross,
    grossPay: salary.grossPay,
    tax: salary.tax,
    netPay: salary.netPay,
    fixedSalary: salary.settings.salaryMode === 'fixed_plus',
  });

  // Accumulated columns: recompute every earlier payout month of the same year.
  // At most twelve months, each a handful of indexed reads.
  let accGross = 0;
  let accTax = 0;
  let accHours = 0;
  for (const month of payoutMonthsThisYear(payMonth)) {
    const earlier = month === payMonth ? salary : computeMonthlySalary(userId, workMonthFor(month));
    if (!earlier) continue;
    accGross += earlier.grossPay;
    accTax += earlier.tax;
    accHours += earlier.workHours;
  }

  const entitlement = settings?.vacationDaysPerYear ?? 25;
  const { start, end } = vacationYearRange(lastDayOfMonth(payMonth));
  const taken = db
    .select()
    .from(vacationDays)
    .where(and(eq(vacationDays.userId, userId), gte(vacationDays.date, start), lte(vacationDays.date, end)))
    .all();
  const paidLeft = entitlement - countPaidVacationDays(taken.map((v) => v.date));

  return {
    payMonth,
    workMonth,
    periodStart: `${payMonth}-01`,
    periodEnd: lastDayOfMonth(payMonth),
    payDate: payDateFor(payMonth, settings?.paydayDay ?? 25),
    employer: {
      name: settings?.employerName ?? '',
      orgNumber: settings?.employerOrgNumber ?? '',
      address: settings?.employerAddress ?? '',
      zipCity: settings?.employerZipCity ?? '',
    },
    employee: {
      name: settings?.employeeName || user.name,
      number: settings?.employeeNumber ?? '',
      address: settings?.employeeAddress ?? '',
      zipCity: settings?.employeeZipCity ?? '',
    },
    lines,
    message: settings?.payslipMessage ?? '',
    bankAccount: settings?.bankAccount ?? '',
    vacation: {
      paid: paidLeft,
      // Saved, advance, unpaid days and comp time are employer-side balances the
      // app has no source for — printed blank rather than as a made-up zero.
      saved: null,
      advance: null,
      unpaid: null,
      entitlement,
      compBalance: null,
    },
    period: { gross: salary.grossPay, benefit: 0, tax: salary.tax, workHours: salary.workHours },
    accumulated: { gross: accGross, benefit: 0, tax: accTax, workHours: accHours },
    employerFee: salary.grossPay * ((settings?.employerFeeRate ?? 31.42) / 100),
    netPay: salary.netPay,
    payout: roundedNetPay(salary.netPay),
  };
}
