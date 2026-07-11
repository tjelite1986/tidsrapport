import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeEntries, users, userSettings, vacationPayInclusions, vacationDays } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { calculateMonthlyPay, buildPaySettings, buildSickContext, type PaySettings, type TimeEntryForPay, type SickDayContext } from '@/lib/calculations';
import { parseBreakPeriods } from '@/lib/types/break-periods';

export const dynamic = 'force-dynamic';

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
    breakPeriods: parseBreakPeriods(e.breakPeriods),
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
    const prevSickDates = prevEntries.filter((e) => e.entryType === 'sick').map((e) => e.date);
    if (prevSickDates.length > 0) {
      prevSickContext = buildSickContext(prevSickDates);
    }
  }

  const salaryMode = (settings?.salaryMode ?? 'contract') as 'contract' | 'hourly' | 'fixed_plus';
  const vacationPayMode = (settings?.vacationPayMode ?? 'included') as 'included' | 'separate';

  // Beräkna semesterlön för uttagna semesterdagar denna arbetsperiod
  // Logik: dagar × (föregående kalenderårs semesterpott ÷ vacationDaysPerYear)
  // Gäller endast i 'separate'-läge (i 'included' finns ingen pot att ta från)
  let vacationDaysPay = 0;
  let vacationDaysCount = 0;
  const vdays = month
    ? db.select().from(vacationDays)
        .where(and(eq(vacationDays.userId, userId), gte(vacationDays.date, `${month}-01`), lte(vacationDays.date, `${month}-31`)))
        .all()
    : [];
  const vacationDates = new Set(vdays.map((v) => v.date));

  if (month && vacationPayMode === 'separate') {
    vacationDaysCount = vdays.length;

    if (vacationDaysCount > 0) {
      const workYear = parseInt(month.split('-')[0]);
      const prevYear = workYear - 1;

      // Hämta alla tidposter för föregående kalenderår
      const prevYearEntries = db
        .select()
        .from(timeEntries)
        .where(and(eq(timeEntries.userId, userId), gte(timeEntries.date, `${prevYear}-01-01`), lte(timeEntries.date, `${prevYear}-12-31`)))
        .all();

      // Gruppera per månad och summera intjänad semesterersättning
      const prevByMonth: Record<string, typeof prevYearEntries> = {};
      for (const e of prevYearEntries) {
        const m = e.date.substring(0, 7);
        if (!prevByMonth[m]) prevByMonth[m] = [];
        prevByMonth[m].push(e);
      }

      let prevYearPot = 0;
      for (const [, monthEntries] of Object.entries(prevByMonth)) {
        const payEntriesMonth: TimeEntryForPay[] = monthEntries.map((e) => ({
          date: e.date,
          hours: e.hours,
          startTime: e.startTime,
          endTime: e.endTime,
          breakMinutes: e.breakMinutes,
          breakPeriods: parseBreakPeriods(e.breakPeriods),
          entryType: e.entryType,
          overtimeType: e.overtimeType,
        }));
        const r = calculateMonthlyPay(
          payEntriesMonth,
          buildPaySettings(user, settings, { vacationPayMode: 'separate', taxYear: prevYear })
        );
        prevYearPot += r.vacationPay;
      }

      const daysPerYear = settings?.vacationDaysPerYear ?? 25;
      if (prevYearPot > 0 && daysPerYear > 0) {
        const dailyRate = prevYearPot / daysPerYear;
        vacationDaysPay = vacationDaysCount * dailyRate;
      }
    }
  }

  const paySettings: PaySettings = buildPaySettings(user, settings, {
    taxYear: month ? parseInt(month.split('-')[0]) : new Date().getFullYear(),
    includeVacationInSalary: inclusion?.includeInSalary ?? false,
    vacationDaysPay,
    vacationDaysCount,
  });

  // Filtrera bort tidinlägg på semesterdagar — de ersätts av vacationDaysPay
  const filteredPayEntries = payEntries.filter((e) => !vacationDates.has(e.date));

  const result = calculateMonthlyPay(filteredPayEntries, paySettings, prevSickContext);

  return NextResponse.json({
    user: { id: user.id, name: user.name, salaryType: user.salaryType },
    month,
    settings: paySettings,
    ...result,
  });
}
