import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeEntries, projects, userSettings, users, vacationDays } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { calculateOB, type WorkplaceType } from '@/lib/calculations/ob';
import { calculateMonthlyPay, type TimeEntryForPay } from '@/lib/calculations';
import { getHourlyRateForDate } from '@/lib/calculations/contracts';
import { parseBreakPeriods } from '@/lib/types/break-periods';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const userId = parseInt(session.user.id);

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate och endDate krävs' }, { status: 400 });
  }

  const user = db.select().from(users).where(eq(users.id, userId)).get();
  const settings = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();

  const workplaceType = (settings?.workplaceType as WorkplaceType) ?? 'none';
  const contractLevel = settings?.contractLevel ?? '3plus';
  const taxRate = settings?.taxRate ?? 30;
  const vacationPayRate = settings?.vacationPayRate ?? 12;
  const vacationPayMode = (settings?.vacationPayMode as 'included' | 'separate') ?? 'included';
  const customHourlyRate = user?.hourlyRate ?? null;
  const salaryMode = (settings?.salaryMode ?? 'contract') as 'contract' | 'hourly' | 'fixed_plus';

  const entries = db
    .select({
      id: timeEntries.id,
      userId: timeEntries.userId,
      projectId: timeEntries.projectId,
      projectName: projects.name,
      date: timeEntries.date,
      hours: timeEntries.hours,
      startTime: timeEntries.startTime,
      endTime: timeEntries.endTime,
      breakMinutes: timeEntries.breakMinutes,
      breakPeriods: timeEntries.breakPeriods,
      entryType: timeEntries.entryType,
      overtimeType: timeEntries.overtimeType,
      description: timeEntries.description,
      taskSegments: timeEntries.taskSegments,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.date, startDate),
        lte(timeEntries.date, endDate)
      )
    )
    .all();

  // Hämta sjukdagsstate från perioden precis före vyfönstret för korrekt karensdag-hantering
  const prevEntries = db
    .select({ date: timeEntries.date, entryType: timeEntries.entryType })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.date, new Date(new Date(startDate).getTime() - 14 * 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10)),
        lte(timeEntries.date, new Date(new Date(startDate).getTime() - 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10))
      )
    )
    .all();

  const prevSick = prevEntries
    .filter((e) => e.entryType === 'sick')
    .sort((a, b) => a.date.localeCompare(b.date));

  let consecutiveSickDays = 0;
  let lastSickDate: string | null = null;
  for (const e of prevSick) {
    if (lastSickDate) {
      const diff = Math.round(
        (new Date(e.date + 'T12:00:00').getTime() - new Date(lastSickDate + 'T12:00:00').getTime()) /
          (1000 * 60 * 60 * 24)
      );
      consecutiveSickDays = diff <= 1 ? consecutiveSickDays + 1 : 1;
    } else {
      consecutiveSickDays = 1;
    }
    lastSickDate = e.date;
  }

  // Sortera poster efter datum för korrekt sekventiell beräkning
  const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const enrichedMap = new Map<number, Omit<(typeof entries)[0], 'breakPeriods'> & { breakPeriods: import('@/lib/types/break-periods').BreakPeriod[] | null; pay: object }>();

  for (const entry of sortedEntries) {
    const hourlyRate = customHourlyRate ?? getHourlyRateForDate(contractLevel, entry.date);
    let basePay = 0;
    let obAmount = 0;
    let obSegments: { hours: number; obPercent: number; obAmount: number }[] = [];
    let overtimePay = 0;
    let sickPay = 0;

    if (entry.entryType === 'sick') {
      // Uppdatera sjukdagskedjans state
      if (lastSickDate) {
        const diff = Math.round(
          (new Date(entry.date + 'T12:00:00').getTime() - new Date(lastSickDate + 'T12:00:00').getTime()) /
            (1000 * 60 * 60 * 24)
        );
        consecutiveSickDays = diff <= 1 ? consecutiveSickDays + 1 : 1;
      } else {
        consecutiveSickDays = 1;
      }
      lastSickDate = entry.date;
      // Dag 1 = karensdag = 0 kr, dag 2+ = 80%
      sickPay = consecutiveSickDays === 1 ? 0 : hourlyRate * entry.hours * 0.8;
    } else {
      // Arbetsdag bryter sjukdagskedjan
      consecutiveSickDays = 0;
      lastSickDate = null;
      basePay = hourlyRate * entry.hours;

      if (entry.startTime && entry.endTime && workplaceType !== 'none') {
        const obResult = calculateOB(
          entry.date,
          entry.startTime,
          entry.endTime,
          entry.breakMinutes ?? 0,
          hourlyRate,
          workplaceType,
          parseBreakPeriods(entry.breakPeriods)
        );
        obAmount = obResult.totalOBAmount;
        obSegments = obResult.segments.filter((s) => s.obAmount > 0).map((s) => ({
          hours: s.hours,
          obPercent: s.obPercent,
          obAmount: s.obAmount,
        }));
      }

      if (entry.overtimeType === 'mertid') {
        overtimePay = hourlyRate * entry.hours * 0.35;
      } else if (entry.overtimeType === 'enkel') {
        overtimePay = hourlyRate * entry.hours * 0.35;
      } else if (entry.overtimeType === 'kvalificerad') {
        overtimePay = hourlyRate * entry.hours * 0.70;
      }
    }

    const grossPay = basePay + obAmount + overtimePay + sickPay;
    // Beräkna semesterersättning för visning oavsett läge.
    // 'separate': läggs i potten, ingår INTE i bruttolönen eller skatteunderlaget.
    // 'included': läggs till bruttolönen och skattas ihop med lönen.
    const vacationPay = grossPay * (vacationPayRate / 100);
    const vacationPayInSalary = vacationPayMode === 'included' ? vacationPay : 0;
    const totalGross = grossPay + vacationPayInSalary;
    const tax = totalGross * (taxRate / 100);
    const netPay = totalGross - tax;

    enrichedMap.set(entry.id, {
      ...entry,
      breakPeriods: parseBreakPeriods(entry.breakPeriods),
      pay: {
        basePay,
        obAmount,
        obSegments,
        overtimePay,
        sickPay,
        grossPay,
        vacationPay,
        tax,
        netPay,
        hourlyRate,
      },
    });
  }

  // Returnera i originalordning (UI kan ha sorterat annorlunda)
  const enrichedEntries = entries.map((e) => enrichedMap.get(e.id)!);

  // Hämta semesterdagar för perioden
  const vdays = db
    .select()
    .from(vacationDays)
    .where(and(eq(vacationDays.userId, userId), gte(vacationDays.date, startDate), lte(vacationDays.date, endDate)))
    .all();

  let vacDaysWithPay: { date: string; dailyPay: number; note: string | null }[] = [];
  if (vdays.length > 0) {
    let dailyRate = 0;
    if (vacationPayMode === 'separate') {
      const workYear = parseInt(startDate.slice(0, 4));
      const prevYear = workYear - 1;
      const prevYearEntries = db
        .select()
        .from(timeEntries)
        .where(and(eq(timeEntries.userId, userId), gte(timeEntries.date, `${prevYear}-01-01`), lte(timeEntries.date, `${prevYear}-12-31`)))
        .all();
      const prevByMonth: Record<string, typeof prevYearEntries> = {};
      for (const e of prevYearEntries) {
        const m = e.date.substring(0, 7);
        if (!prevByMonth[m]) prevByMonth[m] = [];
        prevByMonth[m].push(e);
      }
      let prevYearPot = 0;
      for (const [, monthEntries] of Object.entries(prevByMonth)) {
        const payEntriesMonth: TimeEntryForPay[] = monthEntries.map((e) => ({
          date: e.date, hours: e.hours, startTime: e.startTime, endTime: e.endTime,
          breakMinutes: e.breakMinutes, breakPeriods: parseBreakPeriods(e.breakPeriods),
          entryType: e.entryType, overtimeType: e.overtimeType,
        }));
        const r = calculateMonthlyPay(payEntriesMonth, {
          workplaceType,
          contractLevel,
          taxRate,
          vacationPayRate,
          vacationPayMode: 'separate',
          hourlyRate: customHourlyRate ?? undefined,
          taxYear: prevYear,
          salaryMode,
          fixedMonthlySalary: settings?.fixedMonthlySalary ?? undefined,
          workingHoursPerMonth: settings?.workingHoursPerMonth ?? 160,
        });
        prevYearPot += r.vacationPay;
      }
      const daysPerYear = settings?.vacationDaysPerYear ?? 25;
      if (prevYearPot > 0 && daysPerYear > 0) {
        dailyRate = prevYearPot / daysPerYear;
      }
    }
    vacDaysWithPay = vdays.map((v) => ({ date: v.date, dailyPay: dailyRate, note: v.note ?? null }));
  }

  // Filtrera bort tidinlägg på semesterdagar — semester ersätter ordinarie tid
  const vacationDates = new Set(vacDaysWithPay.map((v) => v.date));
  const filteredEntries = enrichedEntries.filter((e) => !vacationDates.has(e.date));

  return NextResponse.json({ entries: filteredEntries, vacationDays: vacDaysWithPay });
}
