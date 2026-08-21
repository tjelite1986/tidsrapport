import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPayslip, readPayslipFile } from '@/lib/payslips/store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const id = parseInt(params.id, 10);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Hittades inte' }, { status: 404 });

  // Scoped to the owner, and a miss is a 404 — another user's payslip must not
  // be distinguishable from one that does not exist.
  const row = getPayslip(id, userId);
  if (!row) return NextResponse.json({ error: 'Hittades inte' }, { status: 404 });

  const data = readPayslipFile(row);
  if (!data) return NextResponse.json({ error: 'Filen saknas på disk' }, { status: 410 });

  const download = req.nextUrl.searchParams.get('download') === '1';
  const disposition = download ? 'attachment' : 'inline';
  const filename = row.originalName.replace(/[^\w.\-() åäöÅÄÖ]/g, '_');

  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': row.mimeType,
      'Content-Length': String(data.length),
      'Content-Disposition': `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
