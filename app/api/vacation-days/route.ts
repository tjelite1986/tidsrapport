import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { vacationDays, userSettings } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);

  const settings = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  const daysPerYear = settings?.vacationDaysPerYear ?? 25;

  // Kalenderår-modell: 1 jan – 31 dec
  const today = new Date();
  const currentYear = today.getFullYear();
  const requestedYear = parseInt(req.nextUrl.searchParams.get('year') ?? String(currentYear));
  const year = isNaN(requestedYear) ? currentYear : requestedYear;

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const allDays = db
    .select()
    .from(vacationDays)
    .where(eq(vacationDays.userId, userId))
    .all()
    .sort((a, b) => a.date.localeCompare(b.date));

  const daysThisYear = allDays.filter((d) => d.date >= yearStart && d.date <= yearEnd);
  const bookedThisYear = daysThisYear.length;
  const remaining = Math.max(0, daysPerYear - bookedThisYear);

  return NextResponse.json({
    days: daysThisYear,
    allDays,
    daysPerYear,
    bookedThisYear,
    remaining,
    year,
    yearStart,
    yearEnd,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const body = await req.json();

  const date: string = body.date;
  const note: string | null = body.note || null;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Ogiltigt datum' }, { status: 400 });
  }

  // Kontrollera om datumet redan finns
  const existing = db
    .select()
    .from(vacationDays)
    .where(and(eq(vacationDays.userId, userId), eq(vacationDays.date, date)))
    .get();

  if (existing) {
    return NextResponse.json({ error: 'Semesterdag för detta datum finns redan' }, { status: 409 });
  }

  const result = db
    .insert(vacationDays)
    .values({ userId, date, note })
    .returning()
    .get();

  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get('id') ?? '');

  if (!id) return NextResponse.json({ error: 'ID saknas' }, { status: 400 });

  // Verifiera att posten tillhör användaren
  const entry = db.select().from(vacationDays).where(eq(vacationDays.id, id)).get();
  if (!entry || entry.userId !== userId) {
    return NextResponse.json({ error: 'Hittades inte' }, { status: 404 });
  }

  db.delete(vacationDays).where(eq(vacationDays.id, id)).run();

  return NextResponse.json({ ok: true });
}
