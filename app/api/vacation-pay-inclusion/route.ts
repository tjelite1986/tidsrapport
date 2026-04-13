import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db, sqlite } from '@/lib/db';
import { vacationPayInclusions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month'); // YYYY-MM (arbetsperiod)
  if (!month) return NextResponse.json({ error: 'month krävs' }, { status: 400 });

  const userId = parseInt(session.user.id);

  const row = db
    .select()
    .from(vacationPayInclusions)
    .where(and(eq(vacationPayInclusions.userId, userId), eq(vacationPayInclusions.month, month)))
    .get();

  return NextResponse.json({
    month,
    includeInSalary: row?.includeInSalary ?? false,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const body = await req.json();
  const { month, includeInSalary } = body;

  if (!month || typeof includeInSalary !== 'boolean') {
    return NextResponse.json({ error: 'month och includeInSalary krävs' }, { status: 400 });
  }

  // Atomär UPSERT via transaktion för att förhindra race conditions
  const upsert = sqlite.transaction(() => {
    const existing = db
      .select()
      .from(vacationPayInclusions)
      .where(and(eq(vacationPayInclusions.userId, userId), eq(vacationPayInclusions.month, month)))
      .get();

    if (existing) {
      db.update(vacationPayInclusions)
        .set({ includeInSalary })
        .where(and(eq(vacationPayInclusions.userId, userId), eq(vacationPayInclusions.month, month)))
        .run();
    } else {
      db.insert(vacationPayInclusions)
        .values({ userId, month, includeInSalary })
        .run();
    }
  });
  upsert();

  return NextResponse.json({ month, includeInSalary });
}
