import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeEntries, users, userSettings, vacationPayInclusions } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { calculateMonthlyPay, type PaySettings, type TimeEntryForPay } from '@/lib/calculations';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month'); // YYYY-MM format
  const userId = parseInt(session.user.id);

  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return NextResponse.json({ error: 'Användare hittades inte' }, { status: 404 });

  const settings = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();

  // Get entries for the month
  let conditions = [eq(timeEntries.userId, userId)];
  if (month) {
    conditions.push(gte(timeEntries.date, `${month}-01`));
    conditions.push(lte(timeEntries.date, `${month}-31`));
  }

  const entries = db
    .select()
    .from(timeEntries)
    .where(and(...conditions))
    .all();

  const payEntries: TimeEntryForPay[] = entries.map((e) => ({
    date: e.date,
    hours: e.hours,
    startTime: e.startTime,
    endTime: e.endTime,
    breakMinutes: e.breakMinutes,
    entryType: e.entryType,
    overtimeType: e.overtimeType,
  }));

  // Kolla om semesterersättning ska inkluderas i lönen denna månad
  const inclusion = month
    ? db.select().from(vacationPayInclusions)
        .where(and(eq(vacationPayInclusions.userId, userId), eq(vacationPayInclusions.month, month)))
        .get()
    : null;

  const paySettings: PaySettings = {
    workplaceType: (settings?.workplaceType as any) ?? 'none',
    contractLevel: settings?.contractLevel ?? '3plus',
    taxRate: settings?.taxRate ?? 30,
    vacationPayRate: settings?.vacationPayRate ?? 12,
    vacationPayMode: (settings?.vacationPayMode as any) ?? 'included',
    hourlyRate: user.hourlyRate ?? undefined,
    taxMode: (settings?.taxMode as any) ?? 'percentage',
    taxTable: settings?.taxTable ?? null,
    taxYear: month ? parseInt(month.split('-')[0]) : new Date().getFullYear(),
    includeVacationInSalary: inclusion?.includeInSalary ?? false,
  };

  const result = calculateMonthlyPay(payEntries, paySettings);

  return NextResponse.json({
    user: { id: user.id, name: user.name, salaryType: user.salaryType },
    month,
    settings: paySettings,
    ...result,
  });
}
