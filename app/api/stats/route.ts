import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeEntries, projects, users, userSettings, vacationPayInclusions } from '@/lib/db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { calculateMonthlyPay, type TimeEntryForPay, type PaySettings } from '@/lib/calculations';
import { parseBreakPeriods } from '@/lib/types/break-periods';
import { getHourlyRate } from '@/lib/calculations/contracts';
import type { WorkplaceType } from '@/lib/calculations/ob';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const yearParam = searchParams.get('year') || String(new Date().getFullYear());
  const allTime = yearParam === 'all';
  const year = allTime ? String(new Date().getFullYear()) : yearParam;
  const userId = parseInt(session.user.id);

  // Hours per month
  const monthlyHours = db
    .select({
      month: sql<string>`substr(${timeEntries.date}, 1, 7)`,
      totalHours: sql<number>`SUM(${timeEntries.hours})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(timeEntries)
    .where(
      allTime
        ? eq(timeEntries.userId, userId)
        : and(
            eq(timeEntries.userId, userId),
            gte(timeEntries.date, `${year}-01-01`),
            lte(timeEntries.date, `${year}-12-31`)
          )
    )
    .groupBy(sql`substr(${timeEntries.date}, 1, 7)`)
    .all();

  // Hours per project
  const projectHours = db
    .select({
      projectName: projects.name,
      totalHours: sql<number>`SUM(${timeEntries.hours})`,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .where(
      allTime
        ? eq(timeEntries.userId, userId)
        : and(
            eq(timeEntries.userId, userId),
            gte(timeEntries.date, `${year}-01-01`),
            lte(timeEntries.date, `${year}-12-31`)
          )
    )
    .groupBy(projects.name)
    .all();

  // Hours per weekday
  const allEntries = db
    .select({
      date: timeEntries.date,
      hours: timeEntries.hours,
      startTime: timeEntries.startTime,
      endTime: timeEntries.endTime,
      breakMinutes: timeEntries.breakMinutes,
      breakPeriods: timeEntries.breakPeriods,
      entryType: timeEntries.entryType,
      overtimeType: timeEntries.overtimeType,
      taskSegments: timeEntries.taskSegments,
    })
    .from(timeEntries)
    .where(
      allTime
        ? eq(timeEntries.userId, userId)
        : and(
            eq(timeEntries.userId, userId),
            gte(timeEntries.date, `${year}-01-01`),
            lte(timeEntries.date, `${year}-12-31`)
          )
    )
    .all();

  const weekdayHours: number[] = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun totalt
  const weekdayCount: number[] = [0, 0, 0, 0, 0, 0, 0]; // antal pass per veckodag
  for (const entry of allEntries) {
    const d = new Date(entry.date + 'T12:00:00');
    const jsDay = d.getDay();
    const idx = jsDay === 0 ? 6 : jsDay - 1;
    weekdayHours[idx] += entry.hours;
    weekdayCount[idx]++;
  }
  const weekdayAvg: number[] = weekdayHours.map((h, i) =>
    weekdayCount[i] > 0 ? h / weekdayCount[i] : 0
  );

  // Entry type distribution
  const entryTypes = db
    .select({
      entryType: timeEntries.entryType,
      totalHours: sql<number>`SUM(${timeEntries.hours})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(timeEntries)
    .where(
      allTime
        ? eq(timeEntries.userId, userId)
        : and(
            eq(timeEntries.userId, userId),
            gte(timeEntries.date, `${year}-01-01`),
            lte(timeEntries.date, `${year}-12-31`)
          )
    )
    .groupBy(timeEntries.entryType)
    .all();

  // Calculate monthly income breakdown (basePay, OB, net) per month
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  const settings = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();

  const basePaySettings: PaySettings = {
    workplaceType: (settings?.workplaceType as WorkplaceType) ?? 'none',
    contractLevel: settings?.contractLevel ?? '3plus',
    taxRate: settings?.taxRate ?? 30,
    vacationPayRate: settings?.vacationPayRate ?? 12,
    vacationPayMode: (settings?.vacationPayMode as 'included' | 'separate') ?? 'included',
    hourlyRate: user?.hourlyRate ?? undefined,
    taxMode: (settings?.taxMode as any) ?? 'percentage',
    taxTable: settings?.taxTable ?? null,
  };

  // Hämta inkluderingsinställningar för hela året
  const allInclusions = db
    .select()
    .from(vacationPayInclusions)
    .where(eq(vacationPayInclusions.userId, userId))
    .all();
  const inclusionsByMonth = new Map(allInclusions.map((i) => [i.month, i.includeInSalary]));

  // Group entries by month and calculate pay
  const entriesByMonth = new Map<string, typeof allEntries>();
  for (const entry of allEntries) {
    const month = entry.date.slice(0, 7);
    if (!entriesByMonth.has(month)) entriesByMonth.set(month, []);
    entriesByMonth.get(month)!.push(entry);
  }

  const monthlyIncome: { month: string; basePay: number; obPay: number; overtimePay: number; grossPay: number; netPay: number }[] = [];
  const obDistributionMap = new Map<number, { hours: number; amount: number }>();

  for (const [month, monthEntries] of entriesByMonth) {
    const payEntries: TimeEntryForPay[] = monthEntries.map((e) => ({
      date: e.date,
      hours: e.hours,
      startTime: e.startTime,
      endTime: e.endTime,
      breakMinutes: e.breakMinutes,
      breakPeriods: parseBreakPeriods(e.breakPeriods),
      entryType: e.entryType,
      overtimeType: e.overtimeType,
    }));

    const taxYear = parseInt(month.split('-')[0]);
    const paySettings: PaySettings = {
      ...basePaySettings,
      taxYear,
      includeVacationInSalary: inclusionsByMonth.get(month) ?? false,
    };
    const result = calculateMonthlyPay(payEntries, paySettings);
    monthlyIncome.push({
      month,
      basePay: result.basePay,
      obPay: result.totalOB,
      overtimePay: result.totalOvertimePay,
      grossPay: result.grossPay,
      netPay: result.netPay,
    });

    // Aggregate OB distribution
    for (const ob of result.obBreakdown) {
      const existing = obDistributionMap.get(ob.percent) || { hours: 0, amount: 0 };
      existing.hours += ob.hours;
      existing.amount += ob.amount;
      obDistributionMap.set(ob.percent, existing);
    }
  }

  const obDistribution = Array.from(obDistributionMap.entries())
    .map(([percent, data]) => ({ percent, hours: data.hours, amount: data.amount }))
    .sort((a, b) => a.percent - b.percent);

  // Department hours from task_segments
  const deptTotalMap = new Map<string, number>();
  const deptMonthMap = new Map<string, Map<string, number>>();

  for (const entry of allEntries) {
    if (!entry.taskSegments) continue;
    try {
      const segments = JSON.parse(entry.taskSegments) as { department: string; startTime: string; endTime: string }[];
      const month = entry.date.slice(0, 7);
      for (const seg of segments) {
        if (!seg.department || !seg.startTime || !seg.endTime) continue;
        const [sh, sm] = seg.startTime.split(':').map(Number);
        const [eh, em] = seg.endTime.split(':').map(Number);
        const hours = Math.max(0, (eh * 60 + em) - (sh * 60 + sm)) / 60;
        deptTotalMap.set(seg.department, (deptTotalMap.get(seg.department) || 0) + hours);
        if (!deptMonthMap.has(month)) deptMonthMap.set(month, new Map());
        const mMap = deptMonthMap.get(month)!;
        mMap.set(seg.department, (mMap.get(seg.department) || 0) + hours);
      }
    } catch {}
  }

  const departmentHours = Array.from(deptTotalMap.entries())
    .map(([department, totalHours]) => ({ department, totalHours }))
    .sort((a, b) => b.totalHours - a.totalHours);

  const departmentMonthly = Array.from(deptMonthMap.entries()).map(([month, mMap]) => ({
    month,
    data: Array.from(mMap.entries()).map(([department, hours]) => ({ department, hours })),
  }));

  // Tillgängliga år med data
  const allYearsRaw = db
    .select({ year: sql<string>`substr(${timeEntries.date}, 1, 4)` })
    .from(timeEntries)
    .where(eq(timeEntries.userId, userId))
    .groupBy(sql`substr(${timeEntries.date}, 1, 4)`)
    .all();
  const allYears = allYearsRaw.map((r) => r.year).sort((a, b) => b.localeCompare(a));

  return NextResponse.json({
    year,
    allTime,
    allYears,
    monthlyHours,
    projectHours,
    weekdayHours,
    weekdayAvg,
    weekdayCount,
    entryTypes,
    monthlyIncome,
    obDistribution,
    departmentHours,
    departmentMonthly,
  });
}
