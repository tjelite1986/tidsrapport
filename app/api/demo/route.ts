import { NextResponse } from 'next/server';

export async function GET() {
  const enabled = process.env.DEMO_MODE === 'true';
  if (!enabled) {
    return NextResponse.json({ enabled: false });
  }
  return NextResponse.json({
    enabled: true,
    admin: { email: 'admin@example.com', password: 'admin123' },
    user: { email: 'anna@example.com', password: 'user123' },
  });
}
