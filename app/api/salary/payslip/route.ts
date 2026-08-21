import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { buildPayslipDocument } from '@/lib/salary/payslip-document';

export const dynamic = 'force-dynamic';

/**
 * The printed lönebesked for one payout month. Always scoped to the session
 * user — an admin cannot pull another user's slip.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const month = new URL(req.url).searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month måste vara YYYY-MM' }, { status: 400 });
  }

  const document = buildPayslipDocument(parseInt(session.user.id), month);
  if (!document) return NextResponse.json({ error: 'Användare hittades inte' }, { status: 404 });

  return NextResponse.json(document);
}
