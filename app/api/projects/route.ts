import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db, sqlite } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const mine = db.select().from(projects).where(eq(projects.userId, userId)).all();
  return NextResponse.json(mine);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const body = await req.json();
  const { name, description } = body;

  if (!name) return NextResponse.json({ error: 'Namn krävs' }, { status: 400 });

  const userId = parseInt(session.user.id);
  const result = db.insert(projects).values({ userId, name, description }).returning().get();
  return NextResponse.json(result);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const body = await req.json();
  const { id, name, description, active } = body;

  if (!id) return NextResponse.json({ error: 'ID krävs' }, { status: 400 });

  const userId = parseInt(session.user.id);
  const result = db
    .update(projects)
    .set({ name, description, active })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning()
    .get();

  if (!result) {
    return NextResponse.json({ error: 'Projektet finns inte eller tillhör inte dig' }, { status: 404 });
  }
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get('id') || '');
  if (!id) return NextResponse.json({ error: 'ID krävs' }, { status: 400 });

  const userId = parseInt(session.user.id);
  const owned = db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .get();
  if (!owned) {
    return NextResponse.json({ error: 'Projektet finns inte eller tillhör inte dig' }, { status: 404 });
  }

  const linked = sqlite
    .prepare('SELECT COUNT(*) as count FROM time_entries WHERE project_id = ? AND user_id = ?')
    .get(id, userId) as { count: number };
  if (linked.count > 0) {
    return NextResponse.json(
      { error: `Projektet har ${linked.count} tidsregistrering(ar) och kan inte tas bort. Inaktivera det istället.` },
      { status: 400 },
    );
  }

  sqlite.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(id, userId);
  return NextResponse.json({ ok: true });
}
