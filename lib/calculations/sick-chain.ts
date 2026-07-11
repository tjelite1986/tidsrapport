// Shared sick-pay chain logic (karensdag tracking).
//
// Återinsjuknanderegeln (sjuklönelagen 7 §): a new sick period that starts within
// five calendar days after the previous one ended counts as a continuation of the
// same period — no new karensdag. Work days, weekends and VAB days in between do
// NOT restart the chain as long as the gap between sick days stays within the window.
export const SICK_RETURN_WINDOW_DAYS = 5;

export interface SickDayContext {
  consecutiveSickDays: number;
  lastSickDate: string | null;
}

export const emptySickContext: SickDayContext = {
  consecutiveSickDays: 0,
  lastSickDate: null,
};

/** Advance the chain state with a sick entry on `date` (dates must be fed in ascending order). */
export function advanceSickChain(ctx: SickDayContext, date: string): SickDayContext {
  let consecutiveSickDays = 1;
  if (ctx.lastSickDate) {
    const last = new Date(ctx.lastSickDate + 'T12:00:00');
    const current = new Date(date + 'T12:00:00');
    const diffDays = Math.round((current.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= SICK_RETURN_WINDOW_DAYS) {
      consecutiveSickDays = ctx.consecutiveSickDays + 1;
    }
  }
  return { consecutiveSickDays, lastSickDate: date };
}

/** Replay a set of sick-entry dates (any order) into a chain context. */
export function buildSickContext(sickDates: string[]): SickDayContext {
  let ctx = emptySickContext;
  for (const date of [...sickDates].sort()) {
    ctx = advanceSickChain(ctx, date);
  }
  return ctx;
}
