import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const username = process.env.DEMO_USERNAME;
  const password = process.env.DEMO_PASSWORD;
  if (!username || !password) {
    return NextResponse.json({ enabled: false });
  }
  return NextResponse.json({ enabled: true, username, password });
}
