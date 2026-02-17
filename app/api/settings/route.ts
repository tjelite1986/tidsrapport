import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const settings = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();

  if (!settings) {
    return NextResponse.json({
      userId,
      workplaceType: 'none',
      contractLevel: '3plus',
      taxRate: 30,
      vacationPayRate: 12,
      vacationPayMode: 'included',
      workingHoursPerMonth: 160,
      autoBreakCalc: true,
      employeeName: null,
      employerName: null,
      defaultStartTime: null,
      defaultEndTime: null,
      calendarViewDefault: 'week',
      taxMode: 'percentage',
      taxTable: null,
      municipality: null,
    });
  }

  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const body = await req.json();

  const existing = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();

  const data = {
    workplaceType: body.workplaceType ?? 'none',
    contractLevel: body.contractLevel ?? '3plus',
    taxRate: body.taxRate ?? 30,
    vacationPayRate: body.vacationPayRate ?? 12,
    vacationPayMode: body.vacationPayMode ?? 'included',
    workingHoursPerMonth: body.workingHoursPerMonth ?? 160,
    autoBreakCalc: body.autoBreakCalc ?? true,
    employeeName: body.employeeName ?? null,
    employerName: body.employerName ?? null,
    defaultStartTime: body.defaultStartTime ?? null,
    defaultEndTime: body.defaultEndTime ?? null,
    calendarViewDefault: body.calendarViewDefault ?? 'week',
    taxMode: body.taxMode ?? 'percentage',
    taxTable: body.taxTable ?? null,
    municipality: body.municipality ?? null,
  };

  if (existing) {
    const result = db
      .update(userSettings)
      .set(data)
      .where(eq(userSettings.userId, userId))
      .returning()
      .get();
    return NextResponse.json(result);
  } else {
    const result = db
      .insert(userSettings)
      .values({ userId, ...data })
      .returning()
      .get();
    return NextResponse.json(result);
  }
}
