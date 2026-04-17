import { calculateOB, type OBResult, type WorkplaceType } from './ob';
import { getHourlyRate, getHourlyRateForDate } from './contracts';
import { calculateWorkHours } from './time-utils';
import { lookupMonthlyTax } from '../tax-tables/tax-lookup';

export interface SickDayContext {
  consecutiveSickDays: number;
  lastSickDate: string | null;
}

export interface TimeEntryForPay {
  date: string;
  hours: number;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number | null;
  breakPeriods?: { start: string; end: string }[] | null;
  entryType: string; // 'work' | 'sick'
  overtimeType: string; // 'none' | 'mertid' | 'enkel' | 'kvalificerad'
}

export interface PaySettings {
  workplaceType: WorkplaceType;
  contractLevel: string;
  taxRate: number;
  vacationPayRate: number;
  vacationPayMode: 'included' | 'separate';
  hourlyRate?: number; // Override from user.hourlyRate (used in 'contract' and 'hourly' modes)
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
  sickPay: number;
  grossBeforeVacation: number;
  vacationPay: number;
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

  // Hjälpfunktion: returnerar rätt timlön för ett givet datum
  function getEntryHourlyRate(date: string): number {
    if (isFixedPlus) return fixedHourlyRate;
    // Manuell timlön (admin-satt) överstyr alltid avtalstabellen
    if (settings.hourlyRate != null) return settings.hourlyRate;
    return getHourlyRateForDate(settings.contractLevel, date);
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

    if (entry.entryType === 'sick') {
      // Check if consecutive
      if (lastSickDate) {
        const last = new Date(lastSickDate + 'T12:00:00');
        const current = new Date(entry.date + 'T12:00:00');
        const diffDays = Math.round((current.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 1) {
          consecutiveSickDays++;
        } else {
          consecutiveSickDays = 1;
        }
      } else {
        consecutiveSickDays = 1;
      }
      lastSickDate = entry.date;
      sickDayCount++;

      // Karensdag = first sick day gets 0
      const daySickPay = consecutiveSickDays === 1 ? 0 : entryRate * hours * 0.8;
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

    // Reset sick day tracking for work days
    if (entry.entryType !== 'sick') {
      consecutiveSickDays = 0;
      lastSickDate = null;
    }

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
    } else if (entry.overtimeType === 'enkel') {
      dayOvertimePay = entryRate * hours * 0.35;
      overtidEnkel += dayOvertimePay;
    } else if (entry.overtimeType === 'kvalificerad') {
      dayOvertimePay = entryRate * hours * 0.70;
      overtidKvalificerad += dayOvertimePay;
    }

    // For butik: OB and overtime don't stack - take the higher one
    if (settings.workplaceType === 'butik' && obResult) {
      const obForDay = obResult.totalOBAmount;
      if (dayOvertimePay > 0 && obForDay > 0) {
        if (dayOvertimePay > obForDay) {
          totalOB -= obForDay; // remove OB, keep overtime
        } else {
          // Remove overtime, keep OB
          if (entry.overtimeType === 'mertid') overtidMertid -= dayOvertimePay;
          else if (entry.overtimeType === 'enkel') overtidEnkel -= dayOvertimePay;
          else if (entry.overtimeType === 'kvalificerad') overtidKvalificerad -= dayOvertimePay;
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
    sickPay,
    grossBeforeVacation,
    vacationPay,
    vacationDaysPay,
    vacationDaysCount,
    grossPay,
    tax,
    netPay,
    hourlyRate,
  };
}
