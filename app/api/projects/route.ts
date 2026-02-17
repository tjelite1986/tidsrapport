import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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
