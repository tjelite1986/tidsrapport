/**
 * The line items of a printed lönebesked, in the employer's own layout:
 * one row per article number with Antal / A-pris / Belopp.
 *
 * The rows always add up to the rounded net pay, so the printed slip can be
 * checked by adding the Belopp column — that is what makes the "996
 * Öresutjämning" row necessary.
 */

export type PayslipLine = {
  /** Article number as printed, e.g. '10' or '411'. */
  art: string;
  text: string;
  quantity: number | null;
  unit: 'Tim' | 'Dgr' | null;
  unitPrice: number | null;
  amount: number;
};

export type PayslipLineSource = {
  /** Work month (YYYY-MM) the slip pays for — names the "Timlön <månad>" row. */
  workMonth: string;
  workHours: number;
  basePay: number;
  obBreakdown: { percent: number; hours: number; amount: number }[];
  overtidMertid: number;
  overtidEnkel: number;
  overtidKvalificerad: number;
  overtimeHours: { mertid: number; enkel: number; kvalificerad: number };
  sickHours: number;
  sickPay: number;
  vacationDaysCount: number;
  vacationDaysPay: number;
  vacationPay: number;
  vacationPayRate: number;
  /** True when the vacation pay is part of gross rather than going to the pot. */
  vacationPayInGross: boolean;
  grossPay: number;
  tax: number;
  netPay: number;
  /** 'fixed_plus' pays a monthly salary, so the base row has no rate to show. */
  fixedSalary?: boolean;
};

const MONTHS = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
];

export function monthName(month: string): string {
  const index = parseInt(month.slice(5, 7), 10) - 1;
  return MONTHS[index] ?? '';
}

/** Article numbers the employer prints for the common OB percentages. */
const OB_ARTICLES: Record<number, string> = { 50: '411', 70: '412', 100: '413' };

/** Cents-level noise must not produce a row of its own. */
function isZero(amount: number): boolean {
  return Math.abs(amount) < 0.005;
}

export function buildPayslipLines(source: PayslipLineSource): PayslipLine[] {
  const lines: PayslipLine[] = [];

  const overtimeHours =
    source.overtimeHours.mertid + source.overtimeHours.enkel + source.overtimeHours.kvalificerad;

  // Average rate over the month rather than the display rate: a rate change
  // mid-month, or an entry paid at a different rate, would otherwise make the
  // Antal x A-pris column disagree with Belopp.
  const avgRate = source.workHours > 0 ? source.basePay / source.workHours : 0;

  // Overtime is printed as its own row with the full hourly cost, so its share
  // of the base pay has to come off the "Timlön" row.
  const overtimeBase = overtimeHours * avgRate;
  const ordinaryHours = source.workHours - overtimeHours;
  const ordinaryPay = source.basePay - overtimeBase;

  if (source.fixedSalary) {
    if (!isZero(source.basePay)) {
      lines.push({ art: '10', text: `Månadslön ${monthName(source.workMonth)}`, quantity: null, unit: null, unitPrice: null, amount: source.basePay });
    }
  } else if (!isZero(ordinaryPay) || ordinaryHours > 0) {
    lines.push({
      art: '10',
      text: `Timlön ${monthName(source.workMonth)}`,
      quantity: ordinaryHours,
      unit: 'Tim',
      unitPrice: avgRate,
      amount: ordinaryPay,
    });
  }

  const overtime: { art: string; text: string; hours: number; supplement: number }[] = [
    { art: '316', text: 'Mertid betald', hours: source.overtimeHours.mertid, supplement: source.overtidMertid },
    { art: '321', text: 'Övertid enkel', hours: source.overtimeHours.enkel, supplement: source.overtidEnkel },
    { art: '331', text: 'Övertid kvalificerad', hours: source.overtimeHours.kvalificerad, supplement: source.overtidKvalificerad },
  ];
  for (const row of overtime) {
    const amount = source.fixedSalary ? row.supplement : row.hours * avgRate + row.supplement;
    if (isZero(amount) && row.hours === 0) continue;
    lines.push({
      art: row.art,
      text: row.text,
      quantity: row.hours > 0 ? row.hours : null,
      unit: row.hours > 0 ? 'Tim' : null,
      unitPrice: row.hours > 0 ? amount / row.hours : null,
      amount,
    });
  }

  for (const ob of source.obBreakdown) {
    if (isZero(ob.amount)) continue;
    lines.push({
      art: OB_ARTICLES[ob.percent] ?? '410',
      text: `OB-tillägg ${ob.percent}%`,
      quantity: ob.hours,
      unit: 'Tim',
      unitPrice: ob.hours > 0 ? ob.amount / ob.hours : null,
      amount: ob.amount,
    });
  }

  if (!isZero(source.sickPay)) {
    lines.push({
      art: '510',
      text: 'Sjuklön 80%',
      quantity: source.sickHours > 0 ? source.sickHours : null,
      unit: source.sickHours > 0 ? 'Tim' : null,
      unitPrice: source.sickHours > 0 ? source.sickPay / source.sickHours : null,
      amount: source.sickPay,
    });
  }

  if (!isZero(source.vacationDaysPay)) {
    lines.push({
      art: '611',
      text: 'Semesterlön betald',
      quantity: source.vacationDaysCount > 0 ? source.vacationDaysCount : null,
      unit: source.vacationDaysCount > 0 ? 'Dgr' : null,
      unitPrice: source.vacationDaysCount > 0 ? source.vacationDaysPay / source.vacationDaysCount : null,
      amount: source.vacationDaysPay,
    });
  }

  // Vacation pay that goes to the pot is not paid out this month, so it must
  // not appear among the rows that add up to the payout.
  if (source.vacationPayInGross && !isZero(source.vacationPay)) {
    lines.push({
      art: '612',
      text: `Semesterersättning ${source.vacationPayRate}%`,
      quantity: null,
      unit: null,
      unitPrice: null,
      amount: source.vacationPay,
    });
  }

  if (!isZero(source.tax)) {
    lines.push({ art: '912', text: 'Preliminär skatt', quantity: null, unit: null, unitPrice: null, amount: -source.tax });
  }

  const rounding = roundedNetPay(source.netPay) - source.netPay;
  if (!isZero(rounding)) {
    lines.push({ art: '996', text: 'Öresutjämning', quantity: null, unit: null, unitPrice: null, amount: rounding });
  }

  return lines;
}

/** The payout is whole kronor; the öre difference is the öresutjämning row. */
export function roundedNetPay(netPay: number): number {
  return Math.round(netPay);
}
