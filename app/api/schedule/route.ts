import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sqlite } from '@/lib/db';

interface ScheduleRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
  break_minutes: number;
  week_type: number;
}

interface SettingsRow {
  schedule_reference_date: string | null;
}

function buildEmptyWeek() {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    startTime: '',
    endTime: '',
    breakMinutes: 0,
  }));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);

  const rows = sqlite
    .prepare('SELECT day_of_week, start_time, end_time, break_minutes, week_type FROM weekly_schedule WHERE user_id = ?')
    .all(userId) as ScheduleRow[];

  const scheduleA = buildEmptyWeek();
  const scheduleB = buildEmptyWeek();

  for (const row of rows) {
    const target = row.week_type === 1 ? scheduleB : scheduleA;
    target[row.day_of_week] = {
      dayOfWeek: row.day_of_week,
      startTime: row.start_time || '',
      endTime: row.end_time || '',
      breakMinutes: row.break_minutes ?? 0,
    };
  }

  const settingsRow = sqlite
    .prepare('SELECT schedule_reference_date FROM user_settings WHERE user_id = ?')
    .get(userId) as SettingsRow | undefined;

  const referenceDate = settingsRow?.schedule_reference_date ?? null;

  return NextResponse.json({ scheduleA, scheduleB, referenceDate });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const body = await req.json();

  const scheduleA: any[] = body.scheduleA || [];
  const scheduleB: any[] = body.scheduleB || [];
  const referenceDate: string | null = body.referenceDate || null;

  // Radera befintligt schema
  sqlite.prepare('DELETE FROM weekly_schedule WHERE user_id = ?').run(userId);

  // Sätt in Vecka A (week_type=0)
  const insertStmt = sqlite.prepare(
    'INSERT INTO weekly_schedule (user_id, day_of_week, start_time, end_time, break_minutes, week_type) VALUES (?, ?, ?, ?, ?, ?)'
  );

  for (const s of scheduleA) {
    if (s.startTime && s.endTime) {
      insertStmt.run(userId, s.dayOfWeek, s.startTime, s.endTime, s.breakMinutes ?? 0, 0);
    }
  }

  // Sätt in Vecka B (week_type=1)
  for (const s of scheduleB) {
    if (s.startTime && s.endTime) {
      insertStmt.run(userId, s.dayOfWeek, s.startTime, s.endTime, s.breakMinutes ?? 0, 1);
    }
  }

  // Spara referenceDate i user_settings
  const existing = sqlite.prepare('SELECT id FROM user_settings WHERE user_id = ?').get(userId);
  if (existing) {
    sqlite.prepare('UPDATE user_settings SET schedule_reference_date = ? WHERE user_id = ?').run(referenceDate, userId);
  } else {
    sqlite.prepare('INSERT INTO user_settings (user_id, schedule_reference_date) VALUES (?, ?)').run(userId, referenceDate);
  }

  // Returnera samma format som GET
  const rows = sqlite
    .prepare('SELECT day_of_week, start_time, end_time, break_minutes, week_type FROM weekly_schedule WHERE user_id = ?')
    .all(userId) as ScheduleRow[];

  const newA = buildEmptyWeek();
  const newB = buildEmptyWeek();
  for (const row of rows) {
    const target = row.week_type === 1 ? newB : newA;
    target[row.day_of_week] = {
      dayOfWeek: row.day_of_week,
      startTime: row.start_time || '',
      endTime: row.end_time || '',
      breakMinutes: row.break_minutes ?? 0,
    };
  }

  return NextResponse.json({ scheduleA: newA, scheduleB: newB, referenceDate });
}
