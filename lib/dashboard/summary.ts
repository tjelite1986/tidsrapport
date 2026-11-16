// Pure helpers behind the start page (Control Center). No fetching and no pay
// rules here: money comes from /api/salary (computeMonthlySalary), this file
// only picks, orders and labels what the existing APIs return.
// Dates: always local components, never toISOString (it shifts to UTC).

export interface DashEntry {
  id: number;
  projectName: string;
  date: string;
  hours: number;
  startTime: string | null;
  endTime: string | null;
  entryType: string;
  description: string | null;
}

export interface PayDay {
  date: string;
  basePay: number;
  obResult: { totalOBAmount: number } | null;
  overtimePay: number;
  sickPay: number;
}

export const dayGross = (d: PayDay) => d.basePay + (d.obResult?.totalOBAmount ?? 0) + d.overtimePay + d.sickPay;

export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Monday–Sunday of the week containing `now`. */
export function weekRange(now: Date): { start: string; end: string } {
  const monday = addDays(now, now.getDay() === 0 ? -6 : 1 - now.getDay());
  return { start: toLocalDate(monday), end: toLocalDate(addDays(monday, 6)) };
}

export function monthRange(now: Date): { start: string; end: string } {
  return {
    start: toLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: toLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

export function monthKey(now: Date): string {
  return toLocalDate(now).slice(0, 7);
}

export function formatDuration(minutes: number): string {
  if (minutes >= 48 * 60) return `${Math.round(minutes / (24 * 60))} dagar`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function shiftTimes(shift: Pick<DashEntry, 'date' | 'startTime' | 'endTime'>): { start: Date; end: Date } {
  const start = new Date(`${shift.date}T${shift.startTime}:00`);
  const end = new Date(`${shift.date}T${shift.endTime ?? shift.startTime}:00`);
  if (end <= start) end.setDate(end.getDate() + 1); // night shift ends the next day
  return { start, end };
}

/** Work shifts that have not ended yet (ongoing or coming), soonest first. */
export function upcomingShifts(entries: DashEntry[], now: Date, limit = 5): DashEntry[] {
  return entries
    .filter((e) => e.entryType === 'work' && e.startTime)
    .filter((e) => shiftTimes(e).end > now)
    .sort((a, b) => shiftTimes(a).start.getTime() - shiftTimes(b).start.getTime())
    .slice(0, limit);
}

export function dayLabel(dateStr: string, now: Date): string {
  if (dateStr === toLocalDate(now)) return 'idag';
  if (dateStr === toLocalDate(addDays(now, 1))) return 'imorgon';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export interface ShiftInfo {
  ongoing: boolean;
  day: string;
  span: string;
  countdown: string;
  progress: number;
}

export function describeShift(shift: DashEntry, now: Date): ShiftInfo | null {
  const { start, end } = shiftTimes(shift);
  const span = `${shift.startTime}–${shift.endTime ?? '?'}`;
  if (start <= now && now < end) {
    return {
      ongoing: true,
      day: 'Idag',
      span,
      countdown: `slutar om ${formatDuration((end.getTime() - now.getTime()) / 60000)}`,
      progress: ((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100,
    };
  }
  if (now < start) {
    return { ongoing: false, day: dayLabel(shift.date, now), span, countdown: `om ${formatDuration((start.getTime() - now.getTime()) / 60000)}`, progress: 0 };
  }
  return null;
}

/** Latest registrations up to and including today, newest first. */
export function recentActivity(entries: DashEntry[], now: Date, limit = 6): DashEntry[] {
  const today = toLocalDate(now);
  return entries
    .filter((e) => e.date <= today)
    .sort((a, b) => (b.date + (b.startTime ?? '')).localeCompare(a.date + (a.startTime ?? '')) || b.id - a.id)
    .slice(0, limit);
}

/**
 * Gross earned this week so far, from the per-day figures of the salary
 * calculation. Today only counts once its shifts are over, so the number never
 * includes pay that is not yet earned.
 */
export function weekEarned(payDays: PayDay[], weekEntries: DashEntry[], now: Date): { gross: number; hours: number } {
  const today = toLocalDate(now);
  const start = weekRange(now).start;
  const todayDone = weekEntries
    .filter((e) => e.date === today && e.entryType === 'work' && e.startTime)
    .every((e) => shiftTimes(e).end <= now);
  const last = todayDone ? today : toLocalDate(addDays(now, -1));
  return {
    gross: payDays.filter((d) => d.date >= start && d.date <= last).reduce((s, d) => s + dayGross(d), 0),
    hours: weekEntries.filter((e) => e.entryType === 'work' && e.date >= start && e.date <= last).reduce((s, e) => s + e.hours, 0),
  };
}

export type SalaryMode = 'contract' | 'hourly' | 'fixed_plus';

export interface EarnedLabels {
  heading: string;
  /** What the figure is an estimate of, and what it leaves out. */
  note: string;
}

/**
 * Wording for the weekly hero. The per-day figures never contain the fixed
 * monthly salary (fixed_plus) or vacation pay (paid per month, not per day), so
 * the text must say what the number covers instead of calling it "earned".
 */
export function earnedLabels(salaryMode: SalaryMode | undefined): EarnedLabels {
  if (salaryMode === 'fixed_plus') {
    return {
      heading: 'Den här veckan har du fått i tillägg',
      note: 'Uppskattning: OB, övertid och sjuklön, brutto före skatt. Exkl. fast månadslön och semesterlön.',
    };
  }
  return {
    heading: 'Den här veckan har du jobbat ihop ca',
    note: 'Uppskattning: grundlön, OB, övertid och sjuklön, brutto före skatt. Exkl. semesterlön.',
  };
}

export function sumHours(entries: DashEntry[], through?: string): number {
  return entries.filter((e) => !through || e.date <= through).reduce((s, e) => s + e.hours, 0);
}

export const ENTRY_TYPE_LABEL: Record<string, string> = { work: 'Arbete', sick: 'Sjuk', vab: 'VAB' };

export type LoadStatus = 'loading' | 'ready' | 'error';

/** State of the "earned this week" hero: any failed source is an error, never an endless spinner. */
export function earnedState(sources: LoadStatus[]): LoadStatus {
  if (sources.includes('error')) return 'error';
  return sources.every((s) => s === 'ready') ? 'ready' : 'loading';
}
