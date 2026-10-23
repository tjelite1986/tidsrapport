import { db, sqlite } from '@/lib/db';
import { timeEntries, type User, type UserSetting } from '@/lib/db/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { calculateMonthlyPay, buildPaySettings, type TimeEntryForPay } from '@/lib/calculations';
import { parseBreakPeriods } from '@/lib/types/break-periods';

// Manual per-day rates, one per vacation year (migration v29). A payslip's
// A-pris only holds for the year it was printed in: 2027's vacation days are
// paid from the pot earned in 2026, so they get a rate of their own. Created
// here as well as in scripts/migrate-v29.ts so a deploy works without a manual
// run; scripts/ cannot import lib/, so keep the two in step.
export const VACATION_DAILY_RATES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS vacation_daily_rates (
  user_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  rate REAL NOT NULL,
  PRIMARY KEY (user_id, year)
);
`;

// Before v29 the manual rate was a single user_settings column that applied to
// every year. It was only ever entered from 2026 payslips, so it moves to 2026
// and the old column is cleared — which also makes this a no-op on later runs.
const LEGACY_RATE_YEAR = 2026;

sqlite.exec(VACATION_DAILY_RATES_TABLE_SQL);
sqlite.transaction(() => {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO vacation_daily_rates (user_id, year, rate)
       SELECT user_id, ?, vacation_daily_rate FROM user_settings WHERE vacation_daily_rate > 0`
    )
    .run(LEGACY_RATE_YEAR);
  sqlite.prepare('UPDATE user_settings SET vacation_daily_rate = NULL WHERE vacation_daily_rate IS NOT NULL').run();
})();

const selectManualRate = sqlite.prepare('SELECT rate FROM vacation_daily_rates WHERE user_id = ? AND year = ?');
const upsertManualRate = sqlite.prepare(
  `INSERT INTO vacation_daily_rates (user_id, year, rate) VALUES (?, ?, ?)
   ON CONFLICT (user_id, year) DO UPDATE SET rate = excluded.rate`
);
const deleteManualRate = sqlite.prepare('DELETE FROM vacation_daily_rates WHERE user_id = ? AND year = ?');

/** The manual per-day rate for vacation days taken in `year`, or null when none is set. */
export function getManualVacationDailyRate(userId: number, year: number): number | null {
  const row = selectManualRate.get(userId, year) as { rate: number } | undefined;
  return row && row.rate > 0 ? row.rate : null;
}

/** Set the manual rate for one vacation year; null or 0 clears it back to the derived rate. */
export function setManualVacationDailyRate(userId: number, year: number, rate: number | null): void {
  if (rate == null || rate <= 0) deleteManualRate.run(userId, year);
  else upsertManualRate.run(userId, year, rate);
}

/**
 * Per-day vacation pay ("A-pris" on the payslip line "611 Semesterlön betald").
 *
 * Single source of truth for /lon, the calendar and the vacation-pay tracker so
 * the three can never show different rates for the same day.
 *
 * When the user has entered a manual rate for this year it wins outright: the
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
  const manual = getManualVacationDailyRate(userId, workYear);
  if (manual != null) return manual;

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
