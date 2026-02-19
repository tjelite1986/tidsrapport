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
  schedule_week_count: number | null;
}

function buildEmptyWeek() {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    startTime: '',
    endTime: '',
    breakMinutes: 0,
  }));
}

function rowsToSchedules(rows: ScheduleRow[]) {
  const schedules = [buildEmptyWeek(), buildEmptyWeek(), buildEmptyWeek(), buildEmptyWeek()];
  for (const row of rows) {
    const t = row.week_type >= 0 && row.week_type <= 3 ? row.week_type : 0;
    schedules[t][row.day_of_week] = {
      dayOfWeek: row.day_of_week,
      startTime: row.start_time || '',
      endTime: row.end_time || '',
      breakMinutes: row.break_minutes ?? 0,
    };
  }
  return schedules;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);

  const rows = sqlite
    .prepare('SELECT day_of_week, start_time, end_time, break_minutes, week_type FROM weekly_schedule WHERE user_id = ?')
    .all(userId) as ScheduleRow[];

  const [scheduleA, scheduleB, scheduleC, scheduleD] = rowsToSchedules(rows);

  const settingsRow = sqlite
    .prepare('SELECT schedule_reference_date, schedule_week_count FROM user_settings WHERE user_id = ?')
    .get(userId) as SettingsRow | undefined;

  return NextResponse.json({
    scheduleA,
    scheduleB,
    scheduleC,
    scheduleD,
    referenceDate: settingsRow?.schedule_reference_date ?? null,
    weekCount: settingsRow?.schedule_week_count ?? 2,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const body = await req.json();

  const schedules: any[][] = [
    body.scheduleA || [],
    body.scheduleB || [],
    body.scheduleC || [],
    body.scheduleD || [],
  ];
  const referenceDate: string | null = body.referenceDate || null;
  const weekCount: number = body.weekCount === 4 ? 4 : 2;

  sqlite.prepare('DELETE FROM weekly_schedule WHERE user_id = ?').run(userId);

  const insertStmt = sqlite.prepare(
    'INSERT INTO weekly_schedule (user_id, day_of_week, start_time, end_time, break_minutes, week_type) VALUES (?, ?, ?, ?, ?, ?)'
  );

  for (let t = 0; t < 4; t++) {
    for (const s of schedules[t]) {
      if (s.startTime && s.endTime) {
        insertStmt.run(userId, s.dayOfWeek, s.startTime, s.endTime, s.breakMinutes ?? 0, t);
      }
    }
  }

  const existing = sqlite.prepare('SELECT id FROM user_settings WHERE user_id = ?').get(userId);
  if (existing) {
    sqlite
      .prepare('UPDATE user_settings SET schedule_reference_date = ?, schedule_week_count = ? WHERE user_id = ?')
      .run(referenceDate, weekCount, userId);
  } else {
    sqlite
      .prepare('INSERT INTO user_settings (user_id, schedule_reference_date, schedule_week_count) VALUES (?, ?, ?)')
      .run(userId, referenceDate, weekCount);
  }

  const rows = sqlite
    .prepare('SELECT day_of_week, start_time, end_time, break_minutes, week_type FROM weekly_schedule WHERE user_id = ?')
    .all(userId) as ScheduleRow[];

  const [newA, newB, newC, newD] = rowsToSchedules(rows);

  return NextResponse.json({ scheduleA: newA, scheduleB: newB, scheduleC: newC, scheduleD: newD, referenceDate, weekCount });
}
