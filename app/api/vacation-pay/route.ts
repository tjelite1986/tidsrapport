import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeEntries, users, userSettings, vacationPayWithdrawals, vacationPayInclusions, vacationDays } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { calculateMonthlyPay, buildPaySettings, isPaidVacationDay, type TimeEntryForPay } from '@/lib/calculations';
import { parseBreakPeriods } from '@/lib/types/break-periods';
import { lookupMonthlyTax } from '@/lib/tax-tables/tax-lookup';
import { getVacationDailyRate } from '@/lib/vacation-rate';

export const dynamic = 'force-dynamic';

interface MonthBreakdownEntry {
  month: string;
  vacationPay: number;
  grossBeforeVacation: number;
  includedInSalary: boolean;
}

interface EarningYear {
  earned: number;
  months: MonthBreakdownEntry[];
  /** Vacation days taken the year after, which this pot pays for. */
  daysTaken: number;
  paidOutViaDays: number;
  /** Manual withdrawals, drawn from the oldest pot first. */
  withdrawn: number;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Single source of truth for the vacation-pay pot. GET (display) and POST
// (withdrawal balance check) must both use this so the checked balance can
// never drift from the balance the user sees.
function computeVacationPayState(userId: number) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  const settings = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  const paySettings = buildPaySettings(user, settings);

  const allInclusions = db
    .select()
    .from(vacationPayInclusions)
    .where(eq(vacationPayInclusions.userId, userId))
    .all();
  const inclusionsByMonth = new Set(
    allInclusions.filter((i) => i.includeInSalary).map((i) => i.month)
  );

  // Only shifts that have happened earn vacation pay. Scheduled shifts further
  // ahead are already in time_entries and would otherwise fill the pot early.
  const today = localToday();
  const allEntries = db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.userId, userId))
    .all()
    .filter((e) => e.date <= today);

  const entriesByMonth: Record<string, typeof allEntries> = {};
  for (const entry of allEntries) {
    const month = entry.date.substring(0, 7);
    if (!entriesByMonth[month]) entriesByMonth[month] = [];
    entriesByMonth[month].push(entry);
  }

  const monthlyBreakdown: MonthBreakdownEntry[] = [];
  let totalAccumulated = 0;
  const yearlyTotals: Record<number, EarningYear> = {};
  const earningYear = (year: number) =>
    (yearlyTotals[year] ??= { earned: 0, months: [], daysTaken: 0, paidOutViaDays: 0, withdrawn: 0 });

  const sortedMonths = Object.keys(entriesByMonth).sort();
  for (const month of sortedMonths) {
    const monthEntries = entriesByMonth[month];
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

    const year = parseInt(month.split('-')[0]);
    const result = calculateMonthlyPay(payEntries, { ...paySettings, taxYear: year });

    // Om semesterersättningen inkluderades i lönen denna månad läggs den INTE till potten.
    // Detsamma gäller för 'included'-läge — semesterersättning ingår alltid i lönen och hamnar aldrig i potten.
    const isIncludedInSalary = inclusionsByMonth.has(month);
    const vacationPayForPot = (isIncludedInSalary || paySettings.vacationPayMode === 'included') ? 0 : result.vacationPay;

    const entry: MonthBreakdownEntry = {
      month,
      vacationPay: vacationPayForPot,
      grossBeforeVacation: result.grossBeforeVacation,
      includedInSalary: isIncludedInSalary,
    };

    monthlyBreakdown.push(entry);
    totalAccumulated += vacationPayForPot;

    earningYear(year).earned += vacationPayForPot;
    earningYear(year).months.push(entry);
  }

  const withdrawals = db
    .select()
    .from(vacationPayWithdrawals)
    .where(eq(vacationPayWithdrawals.userId, userId))
    .orderBy(desc(vacationPayWithdrawals.withdrawnAt))
    .all();

  const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0);
  const totalTax = withdrawals.reduce((sum, w) => sum + (w.tax ?? 0), 0);

  // Vacation days taken in year X are paid from the pot earned in X-1. Only
  // weekdays count — weekends inside a vacation period cost no day. The rate
  // comes from getVacationDailyRate, the same one /lon pays out with, so the pot
  // drains exactly as fast as the salary pays.
  let vacationDaysPaidOut = 0;
  if (paySettings.vacationPayMode === 'separate') {
    const allVacDays = db.select().from(vacationDays).where(eq(vacationDays.userId, userId)).all();
    const vacDaysByYear: Record<number, number> = {};
    for (const v of allVacDays) {
      if (!isPaidVacationDay(v.date)) continue;
      const y = parseInt(v.date.slice(0, 4));
      vacDaysByYear[y] = (vacDaysByYear[y] ?? 0) + 1;
    }
    for (const [yearStr, daysCount] of Object.entries(vacDaysByYear)) {
      const year = parseInt(yearStr);
      const paid = getVacationDailyRate(userId, user, settings, year) * daysCount;
      const pot = earningYear(year - 1);
      pot.daysTaken += daysCount;
      pot.paidOutViaDays += paid;
      vacationDaysPaidOut += paid;
    }
  }

  // Withdrawals carry no year; take each from the oldest pot that still has money
  // left, and let whatever is over land on the newest one.
  const years = Object.keys(yearlyTotals).map(Number).sort((a, b) => a - b);
  let toAllocate = totalWithdrawn;
  for (const y of years) {
    if (toAllocate <= 0) break;
    const pot = yearlyTotals[y];
    const take = Math.min(toAllocate, Math.max(0, pot.earned - pot.paidOutViaDays));
    pot.withdrawn += take;
    toAllocate -= take;
  }
  if (toAllocate > 0 && years.length > 0) yearlyTotals[years[years.length - 1]].withdrawn += toAllocate;

  const balance = totalAccumulated - totalWithdrawn - vacationDaysPaidOut;

  return {
    paySettings,
    monthlyBreakdown,
    yearlyTotals,
    withdrawals,
    totalAccumulated,
    totalWithdrawn,
    totalTax,
    vacationDaysPaidOut,
    balance,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return NextResponse.json({ error: 'Användare hittades inte' }, { status: 404 });

  const state = computeVacationPayState(userId);

  // Build yearly breakdown sorted by year descending
  const yearlyBreakdown = Object.entries(state.yearlyTotals)
    .map(([year, data]) => ({
      year: parseInt(year),
      sempiralYear: parseInt(year) + 1, // semester tas ut året efter intjänande
      earned: data.earned,
      daysTaken: data.daysTaken,
      paidOutViaDays: data.paidOutViaDays,
      withdrawn: data.withdrawn,
      remaining: data.earned - data.paidOutViaDays - data.withdrawn,
      months: [...data.months].reverse(),
    }))
    .sort((a, b) => b.year - a.year);

  return NextResponse.json({
    totalAccumulated: state.totalAccumulated,
    totalWithdrawn: state.totalWithdrawn,
    totalTax: state.totalTax,
    vacationDaysPaidOut: state.vacationDaysPaidOut,
    balance: state.balance,
    vacationPayRate: state.paySettings.vacationPayRate,
    taxMode: state.paySettings.taxMode,
    taxRate: state.paySettings.taxRate,
    taxTable: state.paySettings.taxTable,
    monthlyBreakdown: [...state.monthlyBreakdown].reverse(),
    yearlyBreakdown,
    withdrawals: state.withdrawals,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const body = await req.json();

  const amount = parseFloat(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Ogiltigt belopp' }, { status: 400 });
  }

  // Kontrollera mot exakt samma saldo som visas i GET
  const state = computeVacationPayState(userId);
  if (amount > state.balance) {
    return NextResponse.json(
      { error: `Otillräckligt saldo. Tillgängligt: ${state.balance.toFixed(2)} kr` },
      { status: 400 }
    );
  }

  // Calculate tax on the withdrawal using user's tax settings
  const settings = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();

  const taxMode = settings?.taxMode ?? 'percentage';
  const taxRate = settings?.taxRate ?? 30;
  const taxTable = settings?.taxTable ?? null;
  const currentYear = new Date().getFullYear();

  let tax: number;
  if (taxMode === 'table' && taxTable) {
    // Use tax table — approximate by looking up the withdrawal amount
    tax = lookupMonthlyTax(amount, taxTable, currentYear);
  } else {
    tax = amount * (taxRate / 100);
  }

  const netAmount = amount - tax;

  const result = db
    .insert(vacationPayWithdrawals)
    .values({
      userId,
      amount,
      tax,
      netAmount,
      note: body.note || null,
    })
    .returning()
    .get();

  return NextResponse.json(result);
}
