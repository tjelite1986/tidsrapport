import type { PaySettings } from './pay';
import type { WorkplaceType } from './ob';

export interface RateHistoryEntry {
  effectiveFrom: string;
  hourlyRate: number;
}

/** Parse the user_settings.hourlyRateHistory JSON column defensively. */
export function parseRateHistory(json: string | null | undefined): RateHistoryEntry[] {
  try {
    const arr = JSON.parse(json ?? '[]');
    return Array.isArray(arr)
      ? arr.filter(
          (r): r is RateHistoryEntry =>
            r && typeof r.effectiveFrom === 'string' && typeof r.hourlyRate === 'number'
        )
      : [];
  } catch {
    return [];
  }
}

interface UserRowLike {
  hourlyRate: number | null;
}

interface SettingsRowLike {
  workplaceType?: string | null;
  contractLevel?: string | null;
  taxRate?: number | null;
  vacationPayRate?: number | null;
  vacationPayMode?: string | null;
  salaryMode?: string | null;
  customHourlyRate?: number | null;
  hourlyRateHistory?: string | null;
  taxMode?: string | null;
  taxTable?: number | null;
  fixedMonthlySalary?: number | null;
  workingHoursPerMonth?: number | null;
}

/**
 * Single source of truth for turning a users + user_settings row pair into
 * PaySettings. Every route that calls calculateMonthlyPay must build its
 * settings here so rate history, salary mode and custom rates never drift
 * between /lon, /statistik, /semester and the calendar.
 */
export function buildPaySettings(
  user: UserRowLike | undefined,
  settings: SettingsRowLike | undefined,
  extra?: Partial<PaySettings>
): PaySettings {
  const salaryMode = (settings?.salaryMode ?? 'contract') as 'contract' | 'hourly' | 'fixed_plus';
  return {
    workplaceType: (settings?.workplaceType as WorkplaceType) ?? 'none',
    contractLevel: settings?.contractLevel ?? '3plus',
    taxRate: settings?.taxRate ?? 30,
    vacationPayRate: settings?.vacationPayRate ?? 12,
    vacationPayMode: (settings?.vacationPayMode as 'included' | 'separate') ?? 'included',
    hourlyRate:
      salaryMode === 'hourly'
        ? (settings?.customHourlyRate ?? user?.hourlyRate ?? undefined)
        : (user?.hourlyRate ?? undefined),
    rateHistory: parseRateHistory(settings?.hourlyRateHistory),
    taxMode: (settings?.taxMode as 'percentage' | 'table') ?? 'percentage',
    taxTable: settings?.taxTable ?? null,
    salaryMode,
    fixedMonthlySalary: settings?.fixedMonthlySalary ?? undefined,
    workingHoursPerMonth: settings?.workingHoursPerMonth ?? 160,
    ...extra,
  };
}
