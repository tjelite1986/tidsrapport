import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeEntries, projects, userSettings } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { calculateWorkHours, calculateAutoBreak } from '@/lib/calculations';
import { parseBreakPeriods, serializeBreakPeriods, sumBreakMinutes } from '@/lib/types/break-periods';
import { BreakRule } from '@/lib/calculations';

export const dynamic = 'force-dynamic';

function getUserBreakRules(userId: number): BreakRule[] | undefined {
  const s = db.select({ autoBreakRules: userSettings.autoBreakRules }).from(userSettings).where(eq(userSettings.userId, userId)).get();
  if (!s?.autoBreakRules) return undefined;
  try { return JSON.parse(s.autoBreakRules); } catch { return undefined; }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ENTRY_TYPES = new Set(['work', 'sick', 'vab']);
const OVERTIME_TYPES = new Set(['none', 'mertid', 'enkel', 'kvalificerad']);

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_RE.test(value) && !isNaN(new Date(value + 'T12:00:00').getTime());
}

function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

// Validate the fields shared by POST and PUT; returns an error message or null.
function validateEntryInput(body: any, { requireDate }: { requireDate: boolean }): string | null {
  const { date, hours, startTime, endTime, entryType, overtimeType } = body;
  if (requireDate ? !isValidDate(date) : date !== undefined && !isValidDate(date)) {
    return 'Ogiltigt datum (YYYY-MM-DD krävs)';
  }
  if (startTime != null && startTime !== '' && !isValidTime(startTime)) return 'Ogiltig starttid (HH:MM)';
  if (endTime != null && endTime !== '' && !isValidTime(endTime)) return 'Ogiltig sluttid (HH:MM)';
  if (hours !== undefined && hours !== null && hours !== '' && !Number.isFinite(parseFloat(hours))) {
    return 'Ogiltigt antal timmar';
  }
  if (entryType !== undefined && !ENTRY_TYPES.has(entryType)) return 'Ogiltig posttyp';
  if (overtimeType !== undefined && !OVERTIME_TYPES.has(overtimeType)) return 'Ogiltig övertidstyp';
  return null;
}

function userOwnsProject(userId: number, projectId: number): boolean {
  const row = db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .get();
  return !!row;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const userId = parseInt(session.user.id);

  let conditions = [eq(timeEntries.userId, userId)];
  if (startDate) conditions.push(gte(timeEntries.date, startDate));
  if (endDate) conditions.push(lte(timeEntries.date, endDate));

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
      createdAt: timeEntries.createdAt,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .where(and(...conditions))
    .all();

  const result = entries.map((e) => ({
    ...e,
    breakPeriods: parseBreakPeriods(e.breakPeriods),
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const body = await req.json();
  const { projectId, date, hours, startTime, endTime, breakMinutes, breakPeriods: breakPeriodsRaw, entryType, overtimeType, description, taskSegments } = body;

  if (!projectId || !date) {
    return NextResponse.json({ error: 'Projekt och datum krävs' }, { status: 400 });
  }
  const validationError = validateEntryInput(body, { requireDate: true });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const userId = parseInt(session.user.id);
  if (!userOwnsProject(userId, projectId)) {
    return NextResponse.json({ error: 'Projektet finns inte eller tillhör inte dig' }, { status: 404 });
  }

  let calculatedHours = hours ? parseFloat(hours) : 0;
  let actualBreak = 0;
  let serializedBreakPeriods: string | null = null;

  if (breakPeriodsRaw && Array.isArray(breakPeriodsRaw) && breakPeriodsRaw.length > 0) {
    const periods = parseBreakPeriods(JSON.stringify(breakPeriodsRaw));
    actualBreak = sumBreakMinutes(periods);
    serializedBreakPeriods = serializeBreakPeriods(periods);
  } else if (startTime && endTime) {
    if (breakMinutes === undefined || breakMinutes === null) {
      actualBreak = calculateAutoBreak(startTime, endTime, getUserBreakRules(userId));
    } else {
      actualBreak = breakMinutes ?? 0;
    }
    serializedBreakPeriods = null;
  } else {
    actualBreak = breakMinutes ?? 0;
  }

  if (startTime && endTime) {
    calculatedHours = calculateWorkHours(startTime, endTime, actualBreak);
  }

  if (!Number.isFinite(calculatedHours) || calculatedHours <= 0 || calculatedHours > 24) {
    return NextResponse.json({ error: 'Timmar måste vara större än 0 (max 24)' }, { status: 400 });
  }

  const result = db
    .insert(timeEntries)
    .values({
      userId,
      projectId,
      date,
      hours: calculatedHours,
      startTime: startTime || null,
      endTime: endTime || null,
      breakMinutes: actualBreak,
      breakPeriods: serializedBreakPeriods,
      entryType: entryType || 'work',
      overtimeType: overtimeType || 'none',
      description,
      taskSegments: taskSegments || null,
    })
    .returning()
    .get();

  return NextResponse.json(result);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const body = await req.json();
  const { id, projectId, date, hours, startTime, endTime, breakMinutes, breakPeriods: breakPeriodsRaw, entryType, overtimeType, description, taskSegments } = body;

  if (!id) return NextResponse.json({ error: 'ID krävs' }, { status: 400 });
  const validationError = validateEntryInput(body, { requireDate: false });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const userId = parseInt(session.user.id);
  if (projectId !== undefined && !userOwnsProject(userId, projectId)) {
    return NextResponse.json({ error: 'Projektet finns inte eller tillhör inte dig' }, { status: 404 });
  }

  let calculatedHours = hours ? parseFloat(hours) : 0;
  let actualBreak = 0;
  let serializedBreakPeriods: string | null = null;

  if (breakPeriodsRaw && Array.isArray(breakPeriodsRaw) && breakPeriodsRaw.length > 0) {
    const periods = parseBreakPeriods(JSON.stringify(breakPeriodsRaw));
    actualBreak = sumBreakMinutes(periods);
    serializedBreakPeriods = serializeBreakPeriods(periods);
  } else if (startTime && endTime) {
    if (breakMinutes === undefined || breakMinutes === null) {
      actualBreak = calculateAutoBreak(startTime, endTime, getUserBreakRules(userId));
    } else {
      actualBreak = breakMinutes ?? 0;
    }
    serializedBreakPeriods = null;
  } else {
    actualBreak = breakMinutes ?? 0;
  }

  if (startTime && endTime) {
    calculatedHours = calculateWorkHours(startTime, endTime, actualBreak);
  }

  const updateData: any = {};
  if (projectId !== undefined) updateData.projectId = projectId;
  if (date !== undefined) updateData.date = date;
  if (Number.isFinite(calculatedHours) && calculatedHours > 0 && calculatedHours <= 24) {
    updateData.hours = calculatedHours;
  }
  if (startTime !== undefined) updateData.startTime = startTime || null;
  if (endTime !== undefined) updateData.endTime = endTime || null;
  // Only touch break data when the request actually carries time/break fields —
  // a partial update like {id, description} must not wipe stored breaks
  if (breakPeriodsRaw !== undefined || breakMinutes !== undefined || startTime !== undefined || endTime !== undefined) {
    updateData.breakMinutes = actualBreak;
    updateData.breakPeriods = serializedBreakPeriods;
  }
  if (entryType !== undefined) updateData.entryType = entryType;
  if (overtimeType !== undefined) updateData.overtimeType = overtimeType;
  if (description !== undefined) updateData.description = description;
  if (taskSegments !== undefined) updateData.taskSegments = taskSegments || null;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'Inga fält att uppdatera' }, { status: 400 });
  }

  const result = db
    .update(timeEntries)
    .set(updateData)
    .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, userId)))
    .returning()
    .get();

  if (!result) return NextResponse.json({ error: 'Post hittades inte' }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const all = searchParams.get('all');

  if (all === 'true') {
    db.delete(timeEntries).where(eq(timeEntries.userId, parseInt(session.user.id))).run();
    return NextResponse.json({ ok: true });
  }

  if (!id) return NextResponse.json({ error: 'ID krävs' }, { status: 400 });

  db.delete(timeEntries)
    .where(and(eq(timeEntries.id, parseInt(id)), eq(timeEntries.userId, parseInt(session.user.id))))
    .run();

  return NextResponse.json({ ok: true });
}
