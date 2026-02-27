import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeEntries, projects, userSettings } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { calculateWorkHours, calculateAutoBreak } from '@/lib/calculations';
import { parseBreakPeriods, serializeBreakPeriods, sumBreakMinutes } from '@/lib/types/break-periods';
import { BreakRule } from '@/lib/calculations';

function getUserBreakRules(userId: number): BreakRule[] | undefined {
  const s = db.select({ autoBreakRules: userSettings.autoBreakRules }).from(userSettings).where(eq(userSettings.userId, userId)).get();
  if (!s?.autoBreakRules) return undefined;
  try { return JSON.parse(s.autoBreakRules); } catch { return undefined; }
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

  let calculatedHours = hours ? parseFloat(hours) : 0;
  let actualBreak = 0;
  let serializedBreakPeriods: string | null = null;

  if (breakPeriodsRaw && Array.isArray(breakPeriodsRaw) && breakPeriodsRaw.length > 0) {
    const periods = parseBreakPeriods(JSON.stringify(breakPeriodsRaw));
    actualBreak = sumBreakMinutes(periods);
    serializedBreakPeriods = serializeBreakPeriods(periods);
  } else if (startTime && endTime) {
    if (breakMinutes === undefined || breakMinutes === null) {
      actualBreak = calculateAutoBreak(startTime, endTime, getUserBreakRules(parseInt(session.user.id)));
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

  if (calculatedHours <= 0) {
    return NextResponse.json({ error: 'Timmar måste vara större än 0' }, { status: 400 });
  }

  const result = db
    .insert(timeEntries)
    .values({
      userId: parseInt(session.user.id),
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

  let calculatedHours = hours ? parseFloat(hours) : 0;
  let actualBreak = 0;
  let serializedBreakPeriods: string | null = null;

  if (breakPeriodsRaw && Array.isArray(breakPeriodsRaw) && breakPeriodsRaw.length > 0) {
    const periods = parseBreakPeriods(JSON.stringify(breakPeriodsRaw));
    actualBreak = sumBreakMinutes(periods);
    serializedBreakPeriods = serializeBreakPeriods(periods);
  } else if (startTime && endTime) {
    if (breakMinutes === undefined || breakMinutes === null) {
      actualBreak = calculateAutoBreak(startTime, endTime, getUserBreakRules(parseInt(session.user.id)));
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
  if (calculatedHours > 0) updateData.hours = calculatedHours;
  if (startTime !== undefined) updateData.startTime = startTime || null;
  if (endTime !== undefined) updateData.endTime = endTime || null;
  updateData.breakMinutes = actualBreak;
  updateData.breakPeriods = serializedBreakPeriods;
  if (entryType !== undefined) updateData.entryType = entryType;
  if (overtimeType !== undefined) updateData.overtimeType = overtimeType;
  if (description !== undefined) updateData.description = description;
  if (taskSegments !== undefined) updateData.taskSegments = taskSegments || null;

  const result = db
    .update(timeEntries)
    .set(updateData)
    .where(and(eq(timeEntries.id, id), eq(timeEntries.userId, parseInt(session.user.id))))
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
