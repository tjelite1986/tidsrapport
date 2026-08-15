import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeEntries, projects, userSettings, users, vacationDays } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { calculateOB, type WorkplaceType } from '@/lib/calculations/ob';
import { buildSickContext, advanceSickChain, parseRateHistory, isPaidVacationDay } from '@/lib/calculations';
import type { SickDayContext } from '@/lib/calculations';
import { getVacationDailyRate } from '@/lib/vacation-rate';
import { resolveHourlyRate } from '@/lib/calculations/contracts';
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
  const salaryMode = (settings?.salaryMode ?? 'contract') as 'contract' | 'hourly' | 'fixed_plus';
  // Flat rate fallback, matching the salary route: hourly mode prefers the per-user custom rate.
  const flatRate = salaryMode === 'hourly'
    ? (settings?.customHourlyRate ?? user?.hourlyRate ?? null)
    : (user?.hourlyRate ?? null);
  // Personal date-effective rate history (overrides flatRate per entry date)
  const rateHistory = parseRateHistory(settings?.hourlyRateHistory);

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
  // (30 dagars fönster så att kedjor med 5-dagarsgap fångas)
  const prevEntries = db
    .select({ date: timeEntries.date, entryType: timeEntries.entryType })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.date, new Date(new Date(startDate).getTime() - 30 * 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10)),
        lte(timeEntries.date, new Date(new Date(startDate).getTime() - 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10))
      )
    )
    .all();

  let sickCtx: SickDayContext = buildSickContext(
    prevEntries.filter((e) => e.entryType === 'sick').map((e) => e.date)
  );

  // Sortera poster efter datum för korrekt sekventiell beräkning
  const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const enrichedMap = new Map<number, Omit<(typeof entries)[0], 'breakPeriods'> & { breakPeriods: import('@/lib/types/break-periods').BreakPeriod[] | null; pay: object }>();

  for (const entry of sortedEntries) {
    const hourlyRate = resolveHourlyRate(entry.date, { rateHistory, flatRate, contractLevel });
    let basePay = 0;
    let obAmount = 0;
    let obSegments: { hours: number; obPercent: number; obAmount: number }[] = [];
    let overtimePay = 0;
    let sickPay = 0;

    if (entry.entryType === 'sick') {
      // Återinsjuknanderegeln: gap på upp till 5 kalenderdagar fortsätter perioden
      sickCtx = advanceSickChain(sickCtx, entry.date);
      // Dag 1 = karensdag = 0 kr, dag 2+ = 80%
      sickPay = sickCtx.consecutiveSickDays === 1 ? 0 : hourlyRate * entry.hours * 0.8;
    } else if (entry.entryType === 'vab') {
      // VAB: Försäkringskassan betalar, arbetsgivaren 0 kr. Neutral mot sjukdagskedjan.
    } else {
      // Arbetsdagar bryter inte sjukdagskedjan (återinsjuknanderegeln)
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

      // Butik: OB och övertid staplas inte — den högre vinner (samma regel som calculateMonthlyPay)
      if (workplaceType === 'butik' && obAmount > 0 && overtimePay > 0) {
        if (overtimePay > obAmount) {
          obAmount = 0;
          obSegments = [];
        } else {
          overtimePay = 0;
        }
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

  let vacDaysWithPay: { date: string; dailyPay: number; paid: boolean; note: string | null }[] = [];
  if (vdays.length > 0) {
    const dailyRate =
      vacationPayMode === 'separate'
        ? getVacationDailyRate(userId, user, settings, parseInt(startDate.slice(0, 4)))
        : 0;
    // Helgdatum inuti en semesterperiod drar ingen semesterdag och ger ingen
    // semesterlön — de visas i kalendern men med 0 kr.
    vacDaysWithPay = vdays.map((v) => {
      const paid = isPaidVacationDay(v.date);
      return { date: v.date, dailyPay: paid ? dailyRate : 0, paid, note: v.note ?? null };
    });
  }

  // Filtrera bort tidinlägg på semesterdagar — semester ersätter ordinarie tid
  const vacationDates = new Set(vacDaysWithPay.map((v) => v.date));
  const filteredEntries = enrichedEntries.filter((e) => !vacationDates.has(e.date));

  return NextResponse.json({ entries: filteredEntries, vacationDays: vacDaysWithPay });
}
