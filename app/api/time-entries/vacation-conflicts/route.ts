import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeEntries, projects, vacationDays } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { parseBreakPeriods } from '@/lib/types/break-periods';

export const dynamic = 'force-dynamic';

// Work entries on a date that is also a vacation day. Such a day is paid twice
// in the calculation (hours worked + a vacation day), and the employer pays only
// one of them — June 2026 ran 19 h over the payslip from four of these.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = parseInt(session.user.id);

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
    .innerJoin(vacationDays, and(eq(vacationDays.userId, timeEntries.userId), eq(vacationDays.date, timeEntries.date)))
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .where(and(eq(timeEntries.userId, userId), eq(timeEntries.entryType, 'work')))
    .orderBy(asc(timeEntries.date), asc(timeEntries.startTime))
    .all();

  return NextResponse.json(entries.map((e) => ({ ...e, breakPeriods: parseBreakPeriods(e.breakPeriods) })));
}
