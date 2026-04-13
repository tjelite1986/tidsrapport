import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db, sqlite } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const allProjects = db.select().from(projects).all();
  return NextResponse.json(allProjects);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const body = await req.json();
  const { name, description } = body;

  if (!name) return NextResponse.json({ error: 'Namn krävs' }, { status: 400 });

  const result = db.insert(projects).values({ name, description }).returning().get();
  return NextResponse.json(result);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const body = await req.json();
  const { id, name, description, active } = body;

  if (!id) return NextResponse.json({ error: 'ID krävs' }, { status: 400 });

  const result = db
    .update(projects)
    .set({ name, description, active })
    .where(eq(projects.id, id))
    .returning()
    .get();

  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get('id') || '');
  if (!id) return NextResponse.json({ error: 'ID krävs' }, { status: 400 });

  const linked = sqlite.prepare('SELECT COUNT(*) as count FROM time_entries WHERE project_id = ?').get(id) as { count: number };
  if (linked.count > 0) {
    return NextResponse.json(
      { error: `Projektet har ${linked.count} tidsregistrering(ar) och kan inte tas bort. Inaktivera det istället.` },
      { status: 400 }
    );
  }

  sqlite.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
