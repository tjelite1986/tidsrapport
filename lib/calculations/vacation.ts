/**
 * Vacation-day rules.
 *
 * A vacation period is registered day by day, including weekends, so the whole
 * absence shows up in the calendar. The employer only deducts and pays *weekdays*
 * though: the payslip line "611 Semesterlön betald" for 2026-06-01--2026-06-07
 * (seven calendar days) is 5,00 Dgr, and the "Betalda" balance drops by 5, not 7.
 * Saturdays and Sundays inside the period are free — they neither consume a
 * vacation day nor generate vacation pay.
 */

/** True when this date consumes a vacation day and generates vacation pay (Mon–Fri). */
export function isPaidVacationDay(date: string): boolean {
  // Local date components only — never toISOString (UTC shift).
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return weekday !== 0 && weekday !== 6;
}

/** Number of dates that actually consume vacation days. */
export function countPaidVacationDays(dates: readonly string[]): number {
  return dates.filter(isPaidVacationDay).length;
}
