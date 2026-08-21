import { db } from '@/lib/db';
import { timeEntries, users, userSettings, vacationPayInclusions, vacationDays } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import {
  calculateMonthlyPay,
  buildPaySettings,
  buildSickContext,
  countPaidVacationDays,
  type PaySettings,
  type TimeEntryForPay,
  type SickDayContext,
} from '@/lib/calculations';
import { getVacationDailyRate } from '@/lib/vacation-rate';
import { parseBreakPeriods } from '@/lib/types/break-periods';

/**
 * Monthly pay for one user and one *work* month (YYYY-MM).
 *
 * Extracted verbatim from app/api/salary/route.ts so both /api/salary and
 * /api/payslips can compute the same numbers. `month` may be null, which means
 * "all time entries" — the behaviour /api/salary has always had.
 *
 * Returns null when the user does not exist.
 */
export function computeMonthlySalary(userId: number, month: string | null) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;

  const settings = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();

  // Get entries for the month
  let conditions = [eq(timeEntries.userId, userId)];
  if (month) {
    conditions.push(gte(timeEntries.date, `${month}-01`));
    conditions.push(lte(timeEntries.date, `${month}-31`));
  }

  const entries = db
    .select()
    .from(timeEntries)
    .where(and(...conditions))
    .all();

  const payEntries: TimeEntryForPay[] = entries.map((e) => ({
    date: e.date,
    hours: e.hours,
    startTime: e.startTime,
    endTime: e.endTime,
    breakMinutes: e.breakMinutes,
    breakPeriods: parseBreakPeriods(e.breakPeriods),
    entryType: e.entryType,
    overtimeType: e.overtimeType,
  }));

  // Kolla om semesterersättning ska inkluderas i lönen denna månad
  const inclusion = month
    ? db.select().from(vacationPayInclusions)
        .where(and(eq(vacationPayInclusions.userId, userId), eq(vacationPayInclusions.month, month)))
        .get()
    : null;

  // Bygg sjukdagskontext från föregående månad för att hantera karensdag vid månadsskifte
  let prevSickContext: SickDayContext | undefined;
  if (month) {
    const [y, m] = month.split('-').map(Number);
    const prevMonthDate = new Date(y, m - 2, 1); // föregående månad
    const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const prevEntries = db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), gte(timeEntries.date, `${prevMonthStr}-01`), lte(timeEntries.date, `${prevMonthStr}-31`)))
      .all();
    const prevSickDates = prevEntries.filter((e) => e.entryType === 'sick').map((e) => e.date);
    if (prevSickDates.length > 0) {
      prevSickContext = buildSickContext(prevSickDates);
    }
  }

  const vacationPayMode = (settings?.vacationPayMode ?? 'included') as 'included' | 'separate';

  // Beräkna semesterlön för uttagna semesterdagar denna arbetsperiod.
  // Bara vardagar (mån–fre) drar en semesterdag och ger semesterlön — helger
  // inuti en semesterperiod är arbetsfria, precis som på lönebeskedet.
  // Gäller endast i 'separate'-läge (i 'included' finns ingen pot att ta från)
  let vacationDaysPay = 0;
  let vacationDaysCount = 0;
  const vdays = month
    ? db.select().from(vacationDays)
        .where(and(eq(vacationDays.userId, userId), gte(vacationDays.date, `${month}-01`), lte(vacationDays.date, `${month}-31`)))
        .all()
    : [];
  const vacationDates = new Set(vdays.map((v) => v.date));

  if (month && vacationPayMode === 'separate') {
    vacationDaysCount = countPaidVacationDays(vdays.map((v) => v.date));

    if (vacationDaysCount > 0) {
      const workYear = parseInt(month.split('-')[0]);
      vacationDaysPay = vacationDaysCount * getVacationDailyRate(userId, user, settings, workYear);
    }
  }

  const paySettings: PaySettings = buildPaySettings(user, settings, {
    taxYear: month ? parseInt(month.split('-')[0]) : new Date().getFullYear(),
    includeVacationInSalary: inclusion?.includeInSalary ?? false,
    vacationDaysPay,
    vacationDaysCount,
  });

  // Filtrera bort tidinlägg på semesterdagar — de ersätts av vacationDaysPay
  const filteredPayEntries = payEntries.filter((e) => !vacationDates.has(e.date));

  const result = calculateMonthlyPay(filteredPayEntries, paySettings, prevSickContext);

  return {
    user: { id: user.id, name: user.name, salaryType: user.salaryType },
    month,
    settings: paySettings,
    ...result,
  };
}
