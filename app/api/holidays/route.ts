import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getHolidays } from '@/lib/calculations';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const yearParam = searchParams.get('year');
  const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();
  if (isNaN(year)) {
    return NextResponse.json({ error: 'Ogiltigt år' }, { status: 400 });
  }

  const holidays = getHolidays(year);
  return NextResponse.json(holidays);
}
