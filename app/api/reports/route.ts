import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeEntries, projects, users } from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const projectId = searchParams.get('projectId');
  const userId = searchParams.get('userId');

  let conditions = [];

  if (session.user.role !== 'admin') {
    conditions.push(eq(timeEntries.userId, parseInt(session.user.id)));
  } else if (userId) {
    conditions.push(eq(timeEntries.userId, parseInt(userId)));
  }

  if (startDate) conditions.push(gte(timeEntries.date, startDate));
  if (endDate) conditions.push(lte(timeEntries.date, endDate));
  if (projectId) conditions.push(eq(timeEntries.projectId, parseInt(projectId)));

  const entries = db
    .select({
      id: timeEntries.id,
      userName: users.name,
      projectName: projects.name,
      date: timeEntries.date,
      hours: timeEntries.hours,
      startTime: timeEntries.startTime,
      endTime: timeEntries.endTime,
      breakMinutes: timeEntries.breakMinutes,
      entryType: timeEntries.entryType,
      overtimeType: timeEntries.overtimeType,
      description: timeEntries.description,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(users, eq(timeEntries.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .all();

  return NextResponse.json(entries);
}
