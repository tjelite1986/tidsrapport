import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, salarySettings } from '@/lib/db/schema';
import { hashSync } from 'bcryptjs';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email, password, confirmPassword } = body;

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Namn, e-post och lösenord krävs' }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Lösenordet måste vara minst 6 tecken' }, { status: 400 });
  }

  if (password !== confirmPassword) {
    return NextResponse.json({ error: 'Lösenorden matchar inte' }, { status: 400 });
  }

  const passwordHash = hashSync(password, 10);

  try {
    const user = db
      .insert(users)
      .values({
        name,
        email,
        passwordHash,
        role: 'user',
        salaryType: 'hourly',
        hourlyRate: null,
        monthlySalary: null,
        overtimeRate: null,
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
