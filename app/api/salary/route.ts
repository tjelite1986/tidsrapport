import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { computeMonthlySalary } from '@/lib/salary/monthly';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month'); // YYYY-MM format
  const userId = parseInt(session.user.id);

  const result = computeMonthlySalary(userId, month);
  if (!result) return NextResponse.json({ error: 'Användare hittades inte' }, { status: 404 });

  return NextResponse.json(result);
}
