import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeEntries, users, userSettings, vacationPayInclusions } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { calculateMonthlyPay, type PaySettings, type TimeEntryForPay, type SickDayContext } from '@/lib/calculations';

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

  // Bygg sjukdagskontext från föregående månad för att hantera karensdag vid månadsskifte
  let prevSickContext: SickDayContext | undefined;
  if (month) {
    const [y, m] = month.split('-').map(Number);
    const prevMonthDate = new Date(y, m - 2, 1); // föregående månad
    const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const prevEntries = db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, userId), gte(timeEntries.date, `${prevMonthStr}-01`), lte(timeEntries.date, `${prevMonthStr}-31`)))
      .all();
    const prevSick = prevEntries
      .filter((e) => e.entryType === 'sick')
      .sort((a, b) => a.date.localeCompare(b.date));
    if (prevSick.length > 0) {
      let consecutive = 0;
      let lastDate: string | null = null;
      for (const e of prevSick) {
        if (lastDate) {
          const diff = Math.round(
            (new Date(e.date + 'T12:00:00').getTime() - new Date(lastDate + 'T12:00:00').getTime()) /
              (1000 * 60 * 60 * 24)
          );
          consecutive = diff <= 1 ? consecutive + 1 : 1;
        } else {
          consecutive = 1;
        }
        lastDate = e.date;
      }
      prevSickContext = { consecutiveSickDays: consecutive, lastSickDate: lastDate };
    }
  }

  const salaryMode = (settings?.salaryMode ?? 'contract') as 'contract' | 'hourly' | 'fixed_plus';

  const paySettings: PaySettings = {
    workplaceType: (settings?.workplaceType as any) ?? 'none',
    contractLevel: settings?.contractLevel ?? '3plus',
    taxRate: settings?.taxRate ?? 30,
    vacationPayRate: settings?.vacationPayRate ?? 12,
    vacationPayMode: (settings?.vacationPayMode as any) ?? 'included',
    hourlyRate: salaryMode === 'hourly'
      ? (settings?.customHourlyRate ?? user.hourlyRate ?? undefined)
      : (user.hourlyRate ?? undefined),
    taxMode: (settings?.taxMode as any) ?? 'percentage',
    taxTable: settings?.taxTable ?? null,
    taxYear: month ? parseInt(month.split('-')[0]) : new Date().getFullYear(),
    includeVacationInSalary: inclusion?.includeInSalary ?? false,
    salaryMode,
    fixedMonthlySalary: settings?.fixedMonthlySalary ?? undefined,
    workingHoursPerMonth: settings?.workingHoursPerMonth ?? 160,
  };

  const result = calculateMonthlyPay(payEntries, paySettings, prevSickContext);

  return NextResponse.json({
    user: { id: user.id, name: user.name, salaryType: user.salaryType },
    month,
    settings: paySettings,
    ...result,
  });
}
