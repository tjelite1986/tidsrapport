import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeEntries, projects, userSettings, users } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { calculateOB, type WorkplaceType } from '@/lib/calculations/ob';
import { getHourlyRate } from '@/lib/calculations/contracts';

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
  const hourlyRate = user?.hourlyRate ?? getHourlyRate(contractLevel);

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

  const enrichedEntries = entries.map((entry) => {
    let basePay = 0;
    let obAmount = 0;
    let obSegments: { hours: number; obPercent: number; obAmount: number }[] = [];
    let overtimePay = 0;
    let sickPay = 0;

    if (entry.entryType === 'sick') {
      sickPay = hourlyRate * entry.hours * 0.8; // simplified - doesn't handle karensdag across API
    } else {
      basePay = hourlyRate * entry.hours;

      if (entry.startTime && entry.endTime && workplaceType !== 'none') {
        const obResult = calculateOB(
          entry.date,
          entry.startTime,
          entry.endTime,
          entry.breakMinutes ?? 0,
          hourlyRate,
          workplaceType
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
    const vacationPay = vacationPayMode === 'separate' ? grossPay * (vacationPayRate / 100) : 0;
    const totalGross = grossPay + vacationPay;
    const tax = totalGross * (taxRate / 100);
    const netPay = totalGross - tax;

    return {
      ...entry,
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
    };
  });

  return NextResponse.json({ entries: enrichedEntries });
}
