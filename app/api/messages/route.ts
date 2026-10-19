import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  MAX_MESSAGE_LENGTH,
  countUnread,
  listContacts,
  listConversation,
  markConversationRead,
  sendMessage,
  userExists,
} from '@/lib/messages/store';

export const dynamic = 'force-dynamic';

// GET                 → { contacts, unread }
// GET ?with=<userId>  → { messages } and marks the other user's messages as read
// GET ?unread=1       → { unread } (navigation badge)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const me = parseInt(session.user.id);

  const params = req.nextUrl.searchParams;
  if (params.get('unread')) {
    return NextResponse.json({ unread: countUnread(me) });
  }

  const withParam = params.get('with');
  if (withParam) {
    const other = parseInt(withParam);
    if (!other || other === me || !userExists(other)) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    markConversationRead(me, other);
    return NextResponse.json({ messages: listConversation(me, other) });
  }

  return NextResponse.json({ contacts: listContacts(me), unread: countUnread(me) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const me = parseInt(session.user.id);

  const { recipientId, body } = await req.json().catch(() => ({}));
  const recipient = Number(recipientId);
  const text = typeof body === 'string' ? body.trim() : '';

  if (!Number.isInteger(recipient) || recipient === me || !userExists(recipient)) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  if (!text) return NextResponse.json({ error: 'Message is empty' }, { status: 400 });
  if (text.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters` }, { status: 400 });
  }

  return NextResponse.json(sendMessage(me, recipient, text));
}
