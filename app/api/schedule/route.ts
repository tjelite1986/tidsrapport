import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { weeklySchedule } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const schedule = db.select().from(weeklySchedule).where(eq(weeklySchedule.userId, userId)).all();
  return NextResponse.json(schedule);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const body = await req.json();
  // body.schedule = [{ dayOfWeek, startTime, endTime, breakMinutes }, ...]

  // Delete existing schedule
  db.delete(weeklySchedule).where(eq(weeklySchedule.userId, userId)).run();

  // Insert new schedule
  const entries = (body.schedule || [])
    .filter((s: any) => s.startTime && s.endTime)
    .map((s: any) => ({
      userId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      breakMinutes: s.breakMinutes ?? 0,
    }));

  if (entries.length > 0) {
    db.insert(weeklySchedule).values(entries).run();
  }

  const result = db.select().from(weeklySchedule).where(eq(weeklySchedule.userId, userId)).all();
  return NextResponse.json(result);
}
