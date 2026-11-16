// Pure view helpers for the payslip comparison on /lonespecar. Moved out of the
// page so the mobile cards and the desktop table share one definition of
// "matches", one diff format and one choice of headline rows.
import type { ComparisonRow } from './fields';

export type DiffStatus = 'match' | 'off' | 'none';

/** How large a diff may be before it is flagged: up to 0.60 kr on amounts, otherwise any difference counts. */
export function isMatch(diff: number, unit: ComparisonRow['unit']) {
  return Math.abs(diff) < (unit === 'currency' ? 0.605 : 0.005);
}

export function diffStatus(row: Pick<ComparisonRow, 'diff' | 'unit'>): DiffStatus {
  if (row.diff === null) return 'none';
  return isMatch(row.diff, row.unit) ? 'match' : 'off';
}

export function formatDiff(amount: number, unit: ComparisonRow['unit']) {
  const money = unit === 'currency' || unit === 'rate';
  const formatted = new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: money ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount) < 0.005 ? 0 : Math.abs(amount));
  const suffix = unit === 'currency' ? ' kr' : unit === 'hours' ? ' h' : '';
  if (Math.abs(amount) < 0.005) return `${formatted}${suffix}`;
  return `${amount > 0 ? '+' : '−'}${formatted}${suffix}`;
}

/** The three amounts shown as cards at the top of a payslip: gross, tax, net, in that order. */
export const HEADLINE_KEYS = ['grossPay', 'tax', 'netPay'] as const;

export function headlineRows(comparison: ComparisonRow[]): ComparisonRow[] {
  return HEADLINE_KEYS.map((key) => comparison.find((row) => row.key === key)).filter(
    (row): row is ComparisonRow => Boolean(row),
  );
}

/** Rows below the headline cards, grouped in display order; empty groups are dropped. */
export function detailGroups(comparison: ComparisonRow[]) {
  const headline = new Set<string>(HEADLINE_KEYS);
  return (['time', 'earnings', 'summary'] as const)
    .map((group) => ({ group, rows: comparison.filter((row) => row.group === group && !headline.has(row.key)) }))
    .filter((g) => g.rows.length > 0);
}

/** Count of compared rows that are off, for the badge next to the month. */
export function offCount(comparison: ComparisonRow[]) {
  return comparison.filter((row) => diffStatus(row) === 'off').length;
}

export type MonthBadge =
  | { kind: 'off'; count: number }
  | { kind: 'match' }
  | { kind: 'partial' }
  | { kind: 'none' };

/**
 * Badge next to the month. "Matches" is only claimed when gross, tax and net were
 * all compared and none is off; if some rows were compared but a headline amount
 * is missing on either side, the payslip only partly matches.
 */
export function monthBadge(comparison: ComparisonRow[]): MonthBadge {
  const off = offCount(comparison);
  if (off > 0) return { kind: 'off', count: off };
  const headline = headlineRows(comparison);
  const headlineCompared =
    headline.length === HEADLINE_KEYS.length && headline.every((row) => diffStatus(row) === 'match');
  if (headlineCompared) return { kind: 'match' };
  if (comparison.some((row) => diffStatus(row) === 'match')) return { kind: 'partial' };
  return { kind: 'none' };
}
