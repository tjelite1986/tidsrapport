import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createEvent, deleteEvent, listEvents, parseEventInput, updateEvent } from '@/lib/calendar-events/store';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET ?startDate=&endDate=  → { events }
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const me = parseInt(session.user.id);

  const params = req.nextUrl.searchParams;
  const startDate = params.get('startDate') ?? '';
  const endDate = params.get('endDate') ?? '';
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  return NextResponse.json({ events: listEvents(me, startDate, endDate) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const me = parseInt(session.user.id);

  const input = parseEventInput(await req.json().catch(() => null));
  if (typeof input === 'string') return NextResponse.json({ error: input }, { status: 400 });

  return NextResponse.json(createEvent(me, input));
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const me = parseInt(session.user.id);

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const input = parseEventInput(body);
  if (typeof input === 'string') return NextResponse.json({ error: input }, { status: 400 });

  const event = updateEvent(me, id, input);
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  return NextResponse.json(event);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const me = parseInt(session.user.id);

  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isInteger(id) || !deleteEvent(me, id)) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
