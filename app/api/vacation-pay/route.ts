import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeEntries, users, userSettings, vacationPayWithdrawals } from '@/lib/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { calculateMonthlyPay, type PaySettings, type TimeEntryForPay } from '@/lib/calculations';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return NextResponse.json({ error: 'Användare hittades inte' }, { status: 404 });

  const settings = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();

  const paySettings: PaySettings = {
    workplaceType: (settings?.workplaceType as 'butik' | 'lager' | 'none') ?? 'none',
    contractLevel: settings?.contractLevel ?? '3plus',
    taxRate: settings?.taxRate ?? 30,
    vacationPayRate: settings?.vacationPayRate ?? 12,
    vacationPayMode: (settings?.vacationPayMode as 'included' | 'separate') ?? 'included',
    hourlyRate: user.hourlyRate ?? undefined,
    taxMode: (settings?.taxMode as any) ?? 'percentage',
    taxTable: settings?.taxTable ?? null,
  };

  // Get all time entries grouped by month
  const allEntries = db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.userId, userId))
    .all();

  // Group entries by month
  const entriesByMonth: Record<string, typeof allEntries> = {};
  for (const entry of allEntries) {
    const month = entry.date.substring(0, 7);
    if (!entriesByMonth[month]) entriesByMonth[month] = [];
    entriesByMonth[month].push(entry);
  }

  // Calculate vacation pay per month and group by year
  const monthlyBreakdown: { month: string; vacationPay: number; grossBeforeVacation: number }[] = [];
  let totalAccumulated = 0;
  const yearlyTotals: Record<number, { earned: number; months: { month: string; vacationPay: number; grossBeforeVacation: number }[] }> = {};

  const sortedMonths = Object.keys(entriesByMonth).sort();
  for (const month of sortedMonths) {
    const monthEntries = entriesByMonth[month];
    const payEntries: TimeEntryForPay[] = monthEntries.map((e) => ({
      date: e.date,
      hours: e.hours,
      startTime: e.startTime,
      endTime: e.endTime,
      breakMinutes: e.breakMinutes,
      entryType: e.entryType,
      overtimeType: e.overtimeType,
    }));

    const year = parseInt(month.split('-')[0]);
    const settingsWithYear = { ...paySettings, taxYear: year };
    const result = calculateMonthlyPay(payEntries, settingsWithYear);

    const entry = {
      month,
      vacationPay: result.vacationPay,
      grossBeforeVacation: result.grossBeforeVacation,
    };

    monthlyBreakdown.push(entry);
    totalAccumulated += result.vacationPay;

    if (!yearlyTotals[year]) {
      yearlyTotals[year] = { earned: 0, months: [] };
    }
    yearlyTotals[year].earned += result.vacationPay;
    yearlyTotals[year].months.push(entry);
  }

  // Build yearly breakdown sorted by year descending
  const yearlyBreakdown = Object.entries(yearlyTotals)
    .map(([year, data]) => ({
      year: parseInt(year),
      sempiralYear: parseInt(year) + 1, // semester tas ut året efter intjänande
      earned: data.earned,
      months: data.months.reverse(),
    }))
    .sort((a, b) => b.year - a.year);

  // Get withdrawals
  const withdrawals = db
    .select()
    .from(vacationPayWithdrawals)
    .where(eq(vacationPayWithdrawals.userId, userId))
    .orderBy(desc(vacationPayWithdrawals.withdrawnAt))
    .all();

  const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0);
  const balance = totalAccumulated - totalWithdrawn;

  return NextResponse.json({
    totalAccumulated,
    totalWithdrawn,
    balance,
    vacationPayRate: paySettings.vacationPayRate,
    monthlyBreakdown: monthlyBreakdown.reverse(),
    yearlyBreakdown,
    withdrawals,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const body = await req.json();

  const amount = parseFloat(body.amount);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Ogiltigt belopp' }, { status: 400 });
  }

  const result = db
    .insert(vacationPayWithdrawals)
    .values({
      userId,
      amount,
      note: body.note || null,
    })
    .returning()
    .get();

  return NextResponse.json(result);
}
