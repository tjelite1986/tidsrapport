import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { workTemplates } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const templates = db.select().from(workTemplates).where(eq(workTemplates.userId, userId)).all();
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const body = await req.json();
  const { name, startTime, endTime, breakMinutes } = body;

  if (!name || !startTime || !endTime) {
    return NextResponse.json({ error: 'Namn, starttid och sluttid krävs' }, { status: 400 });
  }

  const result = db
    .insert(workTemplates)
    .values({
      userId: parseInt(session.user.id),
      name,
      startTime,
      endTime,
      breakMinutes: breakMinutes ?? 0,
    })
    .returning()
    .get();

  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID krävs' }, { status: 400 });

  db.delete(workTemplates)
    .where(and(eq(workTemplates.id, parseInt(id)), eq(workTemplates.userId, parseInt(session.user.id))))
    .run();

  return NextResponse.json({ ok: true });
}
