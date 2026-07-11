import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

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
      salaryMode: 'contract',
      customHourlyRate: null,
      fixedMonthlySalary: null,
      hourlyRateHistory: '[]',
      departments: '[]',
      autoBreakRules: '[]',
    });
  }

  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const body = await req.json();

  // Validera contractLevel
  const validContractLevels = ['16ar', '17ar', '18ar', '19ar', '1ar_erf', '2ar', '3plus'];
  if (body.contractLevel !== undefined && !validContractLevels.includes(body.contractLevel)) {
    return NextResponse.json({ error: 'Ogiltigt avtalsnivå' }, { status: 400 });
  }

  // Validera numeriska gränsvärden
  if (body.taxRate !== undefined && (typeof body.taxRate !== 'number' || body.taxRate < 0 || body.taxRate > 100)) {
    return NextResponse.json({ error: 'taxRate måste vara mellan 0 och 100' }, { status: 400 });
  }
  if (body.vacationPayRate !== undefined && (typeof body.vacationPayRate !== 'number' || body.vacationPayRate < 0 || body.vacationPayRate > 100)) {
    return NextResponse.json({ error: 'vacationPayRate måste vara mellan 0 och 100' }, { status: 400 });
  }

  // Validate + normalize date-effective hourly-rate history (stored as JSON string)
  let hourlyRateHistory: string | undefined;
  if (body.hourlyRateHistory !== undefined) {
    let parsed: unknown;
    try {
      parsed = typeof body.hourlyRateHistory === 'string'
        ? JSON.parse(body.hourlyRateHistory)
        : body.hourlyRateHistory;
    } catch {
      return NextResponse.json({ error: 'hourlyRateHistory must be valid JSON' }, { status: 400 });
    }
    if (!Array.isArray(parsed)) {
      return NextResponse.json({ error: 'hourlyRateHistory must be an array' }, { status: 400 });
    }
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const clean: { effectiveFrom: string; hourlyRate: number; note?: string }[] = [];
    for (const row of parsed as any[]) {
      if (!row || !dateRe.test(row.effectiveFrom) || typeof row.hourlyRate !== 'number' || row.hourlyRate < 0 || row.hourlyRate > 100000) {
        return NextResponse.json({ error: 'Invalid hourlyRateHistory row' }, { status: 400 });
      }
      clean.push({
        effectiveFrom: row.effectiveFrom,
        hourlyRate: row.hourlyRate,
        ...(typeof row.note === 'string' && row.note.trim() ? { note: row.note.trim() } : {}),
      });
    }
    clean.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    hourlyRateHistory = JSON.stringify(clean);
  }

  const existing = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();

  // Merge: fields omitted from the body keep their stored value — a page that
  // only edits a subset must not silently reset the rest to defaults
  const data = {
    workplaceType: body.workplaceType ?? existing?.workplaceType ?? 'none',
    contractLevel: body.contractLevel ?? existing?.contractLevel ?? '3plus',
    taxRate: body.taxRate ?? existing?.taxRate ?? 30,
    vacationPayRate: body.vacationPayRate ?? existing?.vacationPayRate ?? 12,
    vacationPayMode: body.vacationPayMode ?? existing?.vacationPayMode ?? 'included',
    workingHoursPerMonth: body.workingHoursPerMonth ?? existing?.workingHoursPerMonth ?? 160,
    autoBreakCalc: body.autoBreakCalc ?? existing?.autoBreakCalc ?? true,
    employeeName: body.employeeName ?? existing?.employeeName ?? null,
    employerName: body.employerName ?? existing?.employerName ?? null,
    defaultStartTime: body.defaultStartTime ?? existing?.defaultStartTime ?? null,
    defaultEndTime: body.defaultEndTime ?? existing?.defaultEndTime ?? null,
    calendarViewDefault: body.calendarViewDefault ?? existing?.calendarViewDefault ?? 'week',
    taxMode: body.taxMode ?? existing?.taxMode ?? 'percentage',
    taxTable: body.taxTable ?? existing?.taxTable ?? null,
    municipality: body.municipality ?? existing?.municipality ?? null,
    salaryMode: body.salaryMode ?? existing?.salaryMode ?? 'contract',
    customHourlyRate: body.customHourlyRate ?? existing?.customHourlyRate ?? null,
    fixedMonthlySalary: body.fixedMonthlySalary ?? existing?.fixedMonthlySalary ?? null,
    hourlyRateHistory: hourlyRateHistory ?? existing?.hourlyRateHistory ?? '[]',
    departments: body.departments ?? existing?.departments ?? '[]',
    autoBreakRules: body.autoBreakRules ?? existing?.autoBreakRules ?? '[]',
    vacationDaysPerYear: body.vacationDaysPerYear ?? existing?.vacationDaysPerYear ?? 25,
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

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const body = await req.json();

  // Tillåt partiell uppdatering — bara fält som finns i body sätts
  const patch: Record<string, unknown> = {};

  if (body.vacationDaysPerYear !== undefined) {
    const v = parseInt(body.vacationDaysPerYear);
    if (isNaN(v) || v < 0 || v > 365) {
      return NextResponse.json({ error: 'Ogiltigt antal semesterdagar' }, { status: 400 });
    }
    patch.vacationDaysPerYear = v;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Inga fält att uppdatera' }, { status: 400 });
  }

  const existing = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();

  if (existing) {
    const result = db
      .update(userSettings)
      .set(patch)
      .where(eq(userSettings.userId, userId))
      .returning()
      .get();
    return NextResponse.json(result);
  } else {
    // Skapa med defaultvärden + patch
    const result = db
      .insert(userSettings)
      .values({
        userId,
        workplaceType: 'none',
        contractLevel: '3plus',
        taxRate: 30,
        vacationPayRate: 12,
        vacationPayMode: 'included',
        workingHoursPerMonth: 160,
        autoBreakCalc: true,
        taxMode: 'percentage',
        calendarViewDefault: 'week',
        departments: '[]',
        salaryMode: 'contract',
        vacationDaysPerYear: 25,
        ...patch,
      })
      .returning()
      .get();
    return NextResponse.json(result);
  }
}
