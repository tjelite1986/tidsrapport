import { calculateOB, type OBResult, type WorkplaceType } from './ob';
import { resolveHourlyRate } from './contracts';
import { calculateWorkHours } from './time-utils';
import { lookupMonthlyTax } from '../tax-tables/tax-lookup';
import { advanceSickChain, type SickDayContext } from './sick-chain';

export type { SickDayContext };

export interface TimeEntryForPay {
  date: string;
  hours: number;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number | null;
  breakPeriods?: { start: string; end: string }[] | null;
  entryType: string; // 'work' | 'sick' | 'vab'
  overtimeType: string; // 'none' | 'mertid' | 'enkel' | 'kvalificerad'
}

export interface PaySettings {
  workplaceType: WorkplaceType;
  contractLevel: string;
  taxRate: number;
  vacationPayRate: number;
  vacationPayMode: 'included' | 'separate';
  hourlyRate?: number; // Override from user.hourlyRate (used in 'contract' and 'hourly' modes)
  // Date-effective personal hourly rates. When non-empty, the rate whose effectiveFrom
  // is the latest date <= the entry date wins, overriding hourlyRate/contract table.
  rateHistory?: { effectiveFrom: string; hourlyRate: number }[];
  taxMode?: 'percentage' | 'table';
  taxTable?: number | null;
  taxYear?: number;
  includeVacationInSalary?: boolean; // Per-månad: semesterersättning inkluderas i bruttolön
  vacationDaysPay?: number; // Semesterlön från föregående års pot (dagar × dagersättning)
  vacationDaysCount?: number; // Antal semesterdagar som genererat semesterlönen
  salaryMode?: 'contract' | 'hourly' | 'fixed_plus';
  fixedMonthlySalary?: number; // Used in 'fixed_plus' mode
  workingHoursPerMonth?: number; // Used to derive hourly rate from fixed salary
}

export interface DayPayDetail {
  date: string;
  hours: number;
  basePay: number;
  obResult: OBResult | null;
  overtimePay: number;
  overtimeType: string;
  sickPay: number;
  entryType: string;
}

export interface OBBreakdownItem {
  percent: number;
  hours: number;
  amount: number;
}

export interface MonthlyPayResult {
  days: DayPayDetail[];
  totalHours: number;
  workHours: number;
  sickDays: number;
  basePay: number;
  totalOB: number;
  obBreakdown: OBBreakdownItem[];
  overtidMertid: number;
  overtidEnkel: number;
  overtidKvalificerad: number;
  totalOvertimePay: number;
  // Hours behind each overtime bucket. The payslip lists overtime as its own
  // line with an "Antal" column, so the amounts alone are not enough.
  overtimeHours: { mertid: number; enkel: number; kvalificerad: number };
  sickHours: number;
  /** Hours on the first day of a sick period, which carry no sick pay. */
  karensHours: number;
  sickPay: number;
  grossBeforeVacation: number;
  vacationPay: number;
  /** The part of vacationPay paid out this month; 0 when it goes to the pot. */
  vacationPayPaid: number;
  vacationDaysPay: number;
  vacationDaysCount: number;
  grossPay: number;
  tax: number;
  netPay: number;
  hourlyRate: number;
}

export function calculateMonthlyPay(
  entries: TimeEntryForPay[],
  settings: PaySettings,
  prevSickContext?: SickDayContext
): MonthlyPayResult {
  const salaryMode = settings.salaryMode ?? 'contract';
  const isFixedPlus = salaryMode === 'fixed_plus';

  // Bastimlön för fixed_plus (härleds från fast månadslön, ej datumbaserad)
  const fixedHourlyRate = isFixedPlus
    ? (() => {
        const fixedSalary = settings.fixedMonthlySalary ?? 0;
        const hoursPerMonth = settings.workingHoursPerMonth ?? 160;
        return hoursPerMonth > 0 ? fixedSalary / hoursPerMonth : 0;
      })()
    : 0;

  // Hjälpfunktion: returnerar rätt timlön för ett givet datum (delad logik med calendar-data)
  function getEntryHourlyRate(date: string): number {
    if (isFixedPlus) return fixedHourlyRate;
    return resolveHourlyRate(date, {
      rateHistory: settings.rateHistory,
      flatRate: settings.hourlyRate ?? null,
      contractLevel: settings.contractLevel,
    });
  }

  // hourlyRate för MonthlyPayResult.hourlyRate — använd första entryns datum som referens för visning
  // (om inga entries finns, fall tillbaka på dagens datum)
  const displayDate = entries.length > 0
    ? [...entries].sort((a, b) => a.date.localeCompare(b.date))[0].date
    : new Date().toISOString().slice(0, 10);
  const hourlyRate = getEntryHourlyRate(displayDate);

  const days: DayPayDetail[] = [];

  let totalHours = 0;
  let workHours = 0;
  let sickDayCount = 0;
  let basePay = 0;
  let totalOB = 0;
  let overtidMertid = 0;
  let overtidEnkel = 0;
  let overtidKvalificerad = 0;
  let mertidHours = 0;
  let enkelHours = 0;
  let kvalificeradHours = 0;
  let sickHours = 0;
  let karensHours = 0;
  let sickPay = 0;

  // Sort entries by date for sick day counting
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  // Track consecutive sick days — initiera från föregående månads kontext om tillgänglig
  let consecutiveSickDays = prevSickContext?.consecutiveSickDays ?? 0;
  let lastSickDate: string | null = prevSickContext?.lastSickDate ?? null;

  for (const entry of sorted) {
    const hours = entry.hours;
    totalHours += hours;
    const entryRate = getEntryHourlyRate(entry.date);

    if (entry.entryType === 'vab') {
      // VAB (vård av sjukt barn): Försäkringskassan betalar ersättningen, arbetsgivaren 0 kr.
      // Neutral mot sjukdagskedjan (varken bryter eller förlänger karens).
      days.push({
        date: entry.date,
        hours,
        basePay: 0,
        obResult: null,
        overtimePay: 0,
        overtimeType: 'none',
        sickPay: 0,
        entryType: 'vab',
      });
      continue;
    }

    if (entry.entryType === 'sick') {
      // Återinsjuknanderegeln: a gap of up to 5 calendar days continues the period
      ({ consecutiveSickDays, lastSickDate } = advanceSickChain(
        { consecutiveSickDays, lastSickDate },
        entry.date
      ));
      sickDayCount++;
      sickHours += hours;

      // Karensdag = first sick day gets 0
      const daySickPay = consecutiveSickDays === 1 ? 0 : entryRate * hours * 0.8;
      if (consecutiveSickDays === 1) karensHours += hours;
      sickPay += daySickPay;

      days.push({
        date: entry.date,
        hours,
        basePay: 0,
        obResult: null,
        overtimePay: 0,
        overtimeType: 'none',
        sickPay: daySickPay,
        entryType: 'sick',
      });
      continue;
    }

    // Work days do not reset the sick chain — återinsjuknanderegeln keeps the
    // period alive as long as the next sick day falls within the 5-day window.

    workHours += hours;
    // For fixed_plus: base pay is a fixed monthly salary, not per-hour
    const dayBasePay = isFixedPlus ? 0 : entryRate * hours;
    basePay += dayBasePay;

    // Calculate OB if we have start/end times
    let obResult: OBResult | null = null;
    if (entry.startTime && entry.endTime) {
      obResult = calculateOB(
        entry.date,
        entry.startTime,
        entry.endTime,
        entry.breakMinutes ?? 0,
        entryRate,
        settings.workplaceType,
        entry.breakPeriods
      );
      totalOB += obResult.totalOBAmount;
    }

    // Overtime calculations
    let dayOvertimePay = 0;
    if (entry.overtimeType === 'mertid') {
      dayOvertimePay = entryRate * hours * 0.35;
      overtidMertid += dayOvertimePay;
      mertidHours += hours;
    } else if (entry.overtimeType === 'enkel') {
      dayOvertimePay = entryRate * hours * 0.35;
      overtidEnkel += dayOvertimePay;
      enkelHours += hours;
    } else if (entry.overtimeType === 'kvalificerad') {
      dayOvertimePay = entryRate * hours * 0.70;
      overtidKvalificerad += dayOvertimePay;
      kvalificeradHours += hours;
    }

    // For butik: OB and overtime don't stack - take the higher one
    if (settings.workplaceType === 'butik' && obResult) {
      const obForDay = obResult.totalOBAmount;
      if (dayOvertimePay > 0 && obForDay > 0) {
        if (dayOvertimePay > obForDay) {
          totalOB -= obForDay; // remove OB, keep overtime
          obResult = null; // drop the day's OB so obBreakdown/payslip rows match totalOB
        } else {
          // Remove overtime, keep OB
          if (entry.overtimeType === 'mertid') { overtidMertid -= dayOvertimePay; mertidHours -= hours; }
          else if (entry.overtimeType === 'enkel') { overtidEnkel -= dayOvertimePay; enkelHours -= hours; }
          else if (entry.overtimeType === 'kvalificerad') { overtidKvalificerad -= dayOvertimePay; kvalificeradHours -= hours; }
          dayOvertimePay = 0;
        }
      }
    }
    // For lager: both OB and overtime apply (they add up)

    days.push({
      date: entry.date,
      hours,
      basePay: dayBasePay,
      obResult,
      overtimePay: dayOvertimePay,
      overtimeType: entry.overtimeType,
      sickPay: 0,
      entryType: 'work',
    });
  }

  // For fixed_plus: override accumulated basePay with the fixed monthly salary
  if (isFixedPlus) {
    basePay = settings.fixedMonthlySalary ?? 0;
  }

  // Build OB breakdown by percent
  const obMap = new Map<number, { hours: number; amount: number }>();
  for (const day of days) {
    if (day.obResult) {
      for (const seg of day.obResult.segments) {
        if (seg.obPercent > 0 && seg.obAmount > 0) {
          const existing = obMap.get(seg.obPercent) || { hours: 0, amount: 0 };
          existing.hours += seg.hours;
          existing.amount += seg.obAmount;
          obMap.set(seg.obPercent, existing);
        }
      }
    }
  }
  const obBreakdown: OBBreakdownItem[] = Array.from(obMap.entries())
    .map(([percent, data]) => ({ percent, hours: data.hours, amount: data.amount }))
    .sort((a, b) => a.percent - b.percent);

  const totalOvertimePay = overtidMertid + overtidEnkel + overtidKvalificerad;
  const grossBeforeVacation = basePay + totalOB + totalOvertimePay + sickPay;

  // Vacation pay
  // 'included': semesterersättning ingår alltid i bruttolönen (beräknas + läggs till gross).
  // 'separate': semesterersättning läggs i potten (beräknas men läggs INTE till gross).
  // includeVacationInSalary (per-månad override för separate-läge): läggs till gross denna månad.
  const vacationPay = grossBeforeVacation * (settings.vacationPayRate / 100);

  const addVacationToGross = settings.vacationPayMode === 'included' || settings.includeVacationInSalary;
  // vacationDaysPay = semesterlön för uttagna dagar (från föregående års pot), alltid med i bruttolönen
  const vacationDaysPay = settings.vacationDaysPay ?? 0;
  const vacationDaysCount = settings.vacationDaysCount ?? 0;
  const grossPay = (addVacationToGross ? grossBeforeVacation + vacationPay : grossBeforeVacation) + vacationDaysPay;
  const tax = settings.taxMode === 'table' && settings.taxTable
    ? lookupMonthlyTax(grossPay, settings.taxTable, settings.taxYear)
    : grossPay * (settings.taxRate / 100);
  const netPay = grossPay - tax;

  return {
    days,
    totalHours,
    workHours,
    sickDays: sickDayCount,
    basePay,
    totalOB,
    obBreakdown,
    overtidMertid,
    overtidEnkel,
    overtidKvalificerad,
    totalOvertimePay,
    overtimeHours: { mertid: mertidHours, enkel: enkelHours, kvalificerad: kvalificeradHours },
    sickHours,
    karensHours,
    sickPay,
    grossBeforeVacation,
    vacationPay,
    vacationPayPaid: addVacationToGross ? vacationPay : 0,
    vacationDaysPay,
    vacationDaysCount,
    grossPay,
    tax,
    netPay,
    hourlyRate,
  };
}
