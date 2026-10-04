/**
 * The payslip line items the app can compare against its own calculation.
 *
 * Everything here is nullable on both sides: a spec where only gross/tax/net
 * is filled in still works, and a work month with no overtime simply has no
 * overtime row.
 */

export type ObLine = {
  percent: number;
  hours: number | null;
  amount: number | null;
};

/** Numeric payslip fields, in the order the salary page presents them. */
export const PAYSLIP_NUMBER_FIELDS = [
  'workHours',
  'hourlyRate',
  'basePay',
  'totalOB',
  'overtimeMertid',
  'overtimeEnkel',
  'overtimeKvalificerad',
  'sickPay',
  'vacationDaysCount',
  'vacationDaysPay',
  'vacationPay',
  'grossPay',
  'tax',
  'netPay',
] as const;

export type PayslipNumberField = (typeof PAYSLIP_NUMBER_FIELDS)[number];

/** `rate` is kr/h: shown and compared to the öre, unlike whole-krona amounts. */
export type PayslipUnit = 'currency' | 'rate' | 'hours' | 'count';

export type PayslipFieldDef = {
  key: PayslipNumberField;
  label: string;
  unit: PayslipUnit;
  group: 'time' | 'earnings' | 'summary';
  /** Field name on the salary calculation, when it differs. */
  calcKey?: string;
  placeholder?: string;
};

export const PAYSLIP_FIELDS: PayslipFieldDef[] = [
  { key: 'workHours', label: 'Arbetad tid', unit: 'hours', group: 'time', placeholder: '162,50' },
  { key: 'hourlyRate', label: 'Timlön', unit: 'rate', group: 'time', placeholder: '175,64' },
  { key: 'basePay', label: 'Grundlön', unit: 'currency', group: 'earnings', placeholder: '28 541,00' },
  { key: 'totalOB', label: 'Totalt OB', unit: 'currency', group: 'earnings', placeholder: '2 145,00' },
  { key: 'overtimeMertid', label: 'Mertid', unit: 'currency', group: 'earnings', calcKey: 'overtidMertid' },
  { key: 'overtimeEnkel', label: 'Enkel övertid', unit: 'currency', group: 'earnings', calcKey: 'overtidEnkel' },
  {
    key: 'overtimeKvalificerad',
    label: 'Kvalificerad övertid',
    unit: 'currency',
    group: 'earnings',
    calcKey: 'overtidKvalificerad',
  },
  { key: 'sickPay', label: 'Sjuklön', unit: 'currency', group: 'earnings' },
  { key: 'vacationDaysCount', label: 'Semesterdagar', unit: 'count', group: 'earnings' },
  { key: 'vacationDaysPay', label: 'Semesterlön', unit: 'currency', group: 'earnings' },
  { key: 'vacationPay', label: 'Semesterersättning', unit: 'currency', group: 'earnings' },
  { key: 'grossPay', label: 'Bruttolön', unit: 'currency', group: 'summary', placeholder: '32 450,00' },
  { key: 'tax', label: 'Skatt', unit: 'currency', group: 'summary', placeholder: '8 332,00' },
  { key: 'netPay', label: 'Nettolön', unit: 'currency', group: 'summary', placeholder: '24 118,00' },
];

/** Rows that are always shown in the comparison, even when both sides are empty. */
const ALWAYS_SHOWN: PayslipNumberField[] = ['grossPay', 'tax', 'netPay'];

/**
 * Parse the OB lines as they arrive from a form or from the AI reader.
 *
 * Accepts a JSON string or an already-parsed array. Returns `undefined` for
 * input that is malformed (the caller answers 400), `null` when there is
 * nothing to store, and a normalised array otherwise. A line where both hours
 * and amount are blank carries no information and is dropped.
 */
export function parseObLines(value: unknown): ObLine[] | null | undefined {
  if (value === null || value === undefined) return null;

  let raw: unknown = value;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(raw)) return undefined;
  if (raw.length > 20) return undefined;

  const lines: ObLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return undefined;
    const entry = item as Record<string, unknown>;

    const percent = toNumber(entry.percent);
    if (percent === undefined) return undefined;
    if (percent === null || !Number.isFinite(percent) || percent < 0 || percent > 300) return undefined;

    const hours = toNumber(entry.hours);
    const amount = toNumber(entry.amount);
    if (hours === undefined || amount === undefined) return undefined;
    if ((hours !== null && hours < 0) || (amount !== null && amount < 0)) return undefined;
    if (hours === null && amount === null) continue;

    // A percentage may only appear once — two lines would silently double the
    // total when the table sums them.
    if (lines.some((line) => line.percent === percent)) return undefined;
    lines.push({ percent: Math.round(percent * 100) / 100, hours, amount });
  }

  if (lines.length === 0) return null;
  lines.sort((a, b) => a.percent - b.percent);
  return lines;
}

/** Read the stored JSON back. Bad data reads as "no lines", never throws. */
export function readObLines(stored: string | null): ObLine[] {
  if (!stored) return [];
  const parsed = parseObLines(stored);
  return parsed ?? [];
}

export function serializeObLines(lines: ObLine[] | null): string | null {
  return lines && lines.length > 0 ? JSON.stringify(lines) : null;
}

function toNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\s| /g, '').replace(/kr$/i, '').replace(/,/g, '.');
    if (!normalized) return null;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export type ComparisonRow = {
  key: string;
  label: string;
  unit: PayslipUnit;
  group: 'time' | 'earnings' | 'summary';
  actual: number | null;
  calculated: number | null;
  diff: number | null;
};

type PayslipAmounts = Partial<Record<PayslipNumberField, number | null>> & { obLines: string | null };

type SalaryLike = Record<string, unknown> & {
  obBreakdown?: { percent: number; hours: number; amount: number }[];
};

/**
 * One row per line item, spec value next to the app's own number.
 *
 * OB is expanded per percentage so a 50%-line that is 3 hours short shows up as
 * its own row instead of disappearing into the OB total.
 */
export function buildComparison(row: PayslipAmounts, salary: SalaryLike | null): ComparisonRow[] {
  const rows: ComparisonRow[] = [];

  const push = (
    key: string,
    label: string,
    unit: PayslipUnit,
    group: ComparisonRow['group'],
    actual: number | null,
    calculated: number | null,
    always = false,
  ) => {
    const calcIsEmpty = calculated === null || Math.abs(calculated) < 0.005;
    if (!always && actual === null && calcIsEmpty) return;
    rows.push({
      key,
      label,
      unit,
      group,
      actual,
      calculated,
      diff: actual === null || calculated === null ? null : actual - calculated,
    });
  };

  for (const field of PAYSLIP_FIELDS) {
    // The per-percentage OB lines are listed above their own total
    if (field.key === 'totalOB') {
      const specLines = readObLines(row.obLines);
      const calcLines = salary?.obBreakdown ?? [];
      const percents = [...new Set([...specLines.map((l) => l.percent), ...calcLines.map((l) => l.percent)])].sort(
        (a, b) => a - b,
      );
      for (const percent of percents) {
        const spec = specLines.find((l) => l.percent === percent);
        const calc = calcLines.find((l) => l.percent === percent);
        // A percentage the calculation does not list is 0 kr, not "unknown" —
        // otherwise an OB line the app never earned shows no diff at all.
        const missing = salary ? 0 : null;
        push(
          `ob-${percent}-hours`,
          `OB ${percent}% · timmar`,
          'hours',
          'earnings',
          spec?.hours ?? null,
          calc ? calc.hours : missing,
        );
        push(
          `ob-${percent}-amount`,
          `OB ${percent}%`,
          'currency',
          'earnings',
          spec?.amount ?? null,
          calc ? calc.amount : missing,
        );
      }
    }

    const actual = row[field.key] ?? null;
    const calculated = salary ? numberOrNull(salary[field.calcKey ?? field.key]) : null;
    push(field.key, field.label, field.unit, field.group, actual, calculated, ALWAYS_SHOWN.includes(field.key));
  }

  return rows;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
