import { db } from '@/lib/db';
import { timeEntries, type User, type UserSetting } from '@/lib/db/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { calculateMonthlyPay, buildPaySettings, type TimeEntryForPay } from '@/lib/calculations';
import { parseBreakPeriods } from '@/lib/types/break-periods';

/**
 * Per-day vacation pay ("A-pris" on the payslip line "611 Semesterlön betald").
 *
 * Single source of truth for /lon, the calendar and the vacation-pay tracker so
 * the three can never show different rates for the same day.
 *
 * When the user has entered a manual rate in settings it wins outright: the
 * derived rate divides the *previous calendar year's* pot by the yearly
 * entitlement, which is only right once a full year of time entries exists and
 * the employer's earning year lines up with the calendar year.
 */
export function getVacationDailyRate(
  userId: number,
  user: User | undefined,
  settings: UserSetting | undefined,
  workYear: number
): number {
  const manual = settings?.vacationDailyRate;
  if (manual != null && manual > 0) return manual;

  if ((settings?.vacationPayMode ?? 'included') !== 'separate') return 0;

  const daysPerYear = settings?.vacationDaysPerYear ?? 25;
  if (daysPerYear <= 0) return 0;

  const prevYear = workYear - 1;
  const prevYearEntries = db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.date, `${prevYear}-01-01`),
        lte(timeEntries.date, `${prevYear}-12-31`)
      )
    )
    .all();

  const prevByMonth: Record<string, typeof prevYearEntries> = {};
  for (const e of prevYearEntries) {
    const m = e.date.substring(0, 7);
    if (!prevByMonth[m]) prevByMonth[m] = [];
    prevByMonth[m].push(e);
  }

  let prevYearPot = 0;
  for (const monthEntries of Object.values(prevByMonth)) {
    const payEntriesMonth: TimeEntryForPay[] = monthEntries.map((e) => ({
      date: e.date,
      hours: e.hours,
      startTime: e.startTime,
      endTime: e.endTime,
      breakMinutes: e.breakMinutes,
      breakPeriods: parseBreakPeriods(e.breakPeriods),
      entryType: e.entryType,
      overtimeType: e.overtimeType,
    }));
    const r = calculateMonthlyPay(
      payEntriesMonth,
      buildPaySettings(user, settings, { vacationPayMode: 'separate', taxYear: prevYear })
    );
    prevYearPot += r.vacationPay;
  }

  return prevYearPot > 0 ? prevYearPot / daysPerYear : 0;
}
