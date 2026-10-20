// Expands a recurring calendar event into the dates it falls on inside a
// window. Pure, so it is unit-tested without a database. All date math uses
// local date components (never toISOString, which shifts to UTC).

export const RECURRENCES = ['none', 'daily', 'weekly', 'biweekly', 'monthly'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export interface RecurringRule {
  date: string; // first occurrence, YYYY-MM-DD
  recurrence: Recurrence;
  recurrenceUntil: string | null; // last allowed date, inclusive
  excludedDates: string[]; // single occurrences the user removed
}

// Guards against a runaway loop on a malformed rule or a huge window.
const MAX_OCCURRENCES = 1000;

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function format(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The n:th occurrence, or null when it does not exist (monthly on the 31st in a 30-day month). */
function nthOccurrence(start: Date, recurrence: Recurrence, n: number): Date | null {
  switch (recurrence) {
    case 'daily':
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + n);
    case 'weekly':
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * n);
    case 'biweekly':
      return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 14 * n);
    case 'monthly': {
      const d = new Date(start.getFullYear(), start.getMonth() + n, start.getDate());
      // Date rolls 31 Apr over to 1 May; skip that month instead
      return d.getDate() === start.getDate() ? d : null;
    }
    default:
      return n === 0 ? start : null;
  }
}

/** Every date of the rule within [windowStart, windowEnd], inclusive. */
export function occurrencesInRange(rule: RecurringRule, windowStart: string, windowEnd: string): string[] {
  const last = rule.recurrenceUntil && rule.recurrenceUntil < windowEnd ? rule.recurrenceUntil : windowEnd;
  if (rule.recurrence === 'none') {
    return rule.date >= windowStart && rule.date <= last && !rule.excludedDates.includes(rule.date) ? [rule.date] : [];
  }

  const start = parse(rule.date);
  const excluded = new Set(rule.excludedDates);
  const out: string[] = [];
  // Jump close to the window instead of walking from the first occurrence
  let n = 0;
  if (rule.date < windowStart && rule.recurrence !== 'monthly') {
    const step = rule.recurrence === 'daily' ? 1 : rule.recurrence === 'weekly' ? 7 : 14;
    const days = Math.round((parse(windowStart).getTime() - start.getTime()) / 86_400_000);
    n = Math.max(0, Math.floor(days / step) - 1);
  }

  for (let i = 0; i < MAX_OCCURRENCES; i++, n++) {
    const d = nthOccurrence(start, rule.recurrence, n);
    if (!d) continue;
    const date = format(d);
    if (date > last) break;
    if (date >= windowStart && !excluded.has(date)) out.push(date);
  }
  return out;
}
