import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db, sqlite } from '@/lib/db';
import { users, salarySettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Ej behörig' }, { status: 403 });
  }

  const allUsers = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      salaryType: users.salaryType,
      hourlyRate: users.hourlyRate,
      monthlySalary: users.monthlySalary,
      overtimeRate: users.overtimeRate,
      createdAt: users.createdAt,
    })
    .from(users)
    .all();

  return NextResponse.json(allUsers);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Ej behörig' }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, role, salaryType, hourlyRate, monthlySalary, overtimeRate } = body;

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Namn, e-post och lösenord krävs' }, { status: 400 });
  }

  const passwordHash = hashSync(password, 10);

  try {
    const user = db
      .insert(users)
      .values({
        name,
        email,
        passwordHash,
        role: role || 'user',
        salaryType: salaryType || 'hourly',
        hourlyRate: hourlyRate || null,
        monthlySalary: monthlySalary || null,
        overtimeRate: overtimeRate || null,
      })
      .returning()
      .get();

    db.insert(salarySettings).values({ userId: user.id, workingHoursPerMonth: 160 }).run();

    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      return NextResponse.json({ error: 'E-postadressen används redan' }, { status: 400 });
    }
    throw e;
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Ej behörig' }, { status: 403 });
  }

  const body = await req.json();
  const { id, name, email, role, salaryType, hourlyRate, monthlySalary, overtimeRate, password } = body;

  if (!id) return NextResponse.json({ error: 'ID krävs' }, { status: 400 });

  const updateData: any = {};
  if (name) updateData.name = name;
  if (email) updateData.email = email;
  if (role) updateData.role = role;
  if (salaryType) updateData.salaryType = salaryType;
  if (hourlyRate !== undefined) updateData.hourlyRate = hourlyRate;
  if (monthlySalary !== undefined) updateData.monthlySalary = monthlySalary;
  if (overtimeRate !== undefined) updateData.overtimeRate = overtimeRate;
  if (password) updateData.passwordHash = hashSync(password, 10);

  const result = db.update(users).set(updateData).where(eq(users.id, id)).returning().get();
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Ej behörig' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get('id') || '');
  if (!id) return NextResponse.json({ error: 'ID krävs' }, { status: 400 });

  if (id === parseInt(session.user.id)) {
    return NextResponse.json({ error: 'Du kan inte ta bort ditt eget konto' }, { status: 400 });
  }

  // Förhindra att admins tar bort andra admins
  const targetUser = db.select().from(users).where(eq(users.id, id)).get();
  if (targetUser?.role === 'admin') {
    return NextResponse.json({ error: 'Administratörskonton kan inte tas bort' }, { status: 403 });
  }

  // Kaskadradera all användardata
  sqlite.prepare('DELETE FROM vacation_pay_inclusions WHERE user_id = ?').run(id);
  sqlite.prepare('DELETE FROM vacation_pay_withdrawals WHERE user_id = ?').run(id);
  sqlite.prepare('DELETE FROM weekly_schedule WHERE user_id = ?').run(id);
  sqlite.prepare('DELETE FROM work_templates WHERE user_id = ?').run(id);
  sqlite.prepare('DELETE FROM time_entries WHERE user_id = ?').run(id);
  sqlite.prepare('DELETE FROM salary_settings WHERE user_id = ?').run(id);
  sqlite.prepare('DELETE FROM user_settings WHERE user_id = ?').run(id);
  sqlite.prepare('DELETE FROM users WHERE id = ?').run(id);

  return NextResponse.json({ ok: true });
}
