import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  countUnreadNotifications,
  deleteNotification,
  deliverAppUpdates,
  listNotifications,
  markNotificationsRead,
} from '@/lib/notifications/store';

export const dynamic = 'force-dynamic';

// GET           → { notifications, unread }
// GET ?unread=1 → { unread } (navigation badge)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const me = parseInt(session.user.id);
  deliverAppUpdates(me);

  if (req.nextUrl.searchParams.get('unread')) {
    return NextResponse.json({ unread: countUnreadNotifications(me) });
  }
  return NextResponse.json({ notifications: listNotifications(me), unread: countUnreadNotifications(me) });
}

// POST { action: 'read' } → marks every notice as read
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const me = parseInt(session.user.id);

  const { action } = await req.json().catch(() => ({}));
  if (action !== 'read') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  markNotificationsRead(me);
  return NextResponse.json({ unread: 0 });
}

// DELETE ?id=<id> → removes one notice (404 for someone else's id)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const me = parseInt(session.user.id);

  const id = parseInt(req.nextUrl.searchParams.get('id') ?? '');
  if (!id || !deleteNotification(me, id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
