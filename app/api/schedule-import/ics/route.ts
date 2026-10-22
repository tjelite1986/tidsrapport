import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { and, eq, gte, lte } from 'drizzle-orm';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeEntries, userSettings } from '@/lib/db/schema';
import { fetchIcs, IcsFetchError, normalizeIcsUrl } from '@/lib/schedule-import/fetch-ics';
import { IcsParseError, parseIcsSchedule, shiftMonthSpan } from '@/lib/schedule-import/ics';

export const dynamic = 'force-dynamic';

/** The schedule link the user imported from last time, if any. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const row = db
    .select({ url: userSettings.scheduleIcsUrl })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();
  return NextResponse.json({ url: row?.url ?? null });
}

/**
 * Fetch an .ics schedule link and answer with its shifts. Saves no time
 * entries — the client confirms and posts them itself, as with the screenshot
 * import — but remembers the link for next time.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.url !== 'string' || !body.url.trim()) {
    return NextResponse.json({ error: 'No link given' }, { status: 400 });
  }

  try {
    const url = normalizeIcsUrl(body.url).toString();
    const parsed = parseIcsSchedule(await fetchIcs(url));

    const userId = parseInt(session.user.id);
    const existingDates = new Set<string>();
    const span = shiftMonthSpan(parsed.shifts);
    if (span) {
      const rows = db
        .select({ date: timeEntries.date })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.userId, userId),
          gte(timeEntries.date, parsed.shifts[0].date),
          lte(timeEntries.date, parsed.shifts[parsed.shifts.length - 1].date),
        ))
        .all();
      for (const row of rows) existingDates.add(row.date);
    }

    rememberUrl(userId, url);

    return NextResponse.json({
      url,
      calendarName: parsed.calendarName,
      from: span?.from ?? null,
      to: span?.to ?? null,
      shifts: parsed.shifts.map((s) => ({ ...s, existing: existingDates.has(s.date) })),
      skipped: parsed.skipped,
    });
  } catch (err) {
    if (err instanceof IcsFetchError) {
      console.error('schedule-import ics:', err.message);
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof IcsParseError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error('schedule-import ics failed:', err);
    return NextResponse.json({ error: 'Calendar import failed' }, { status: 500 });
  }
}

function rememberUrl(userId: number, url: string): void {
  const existing = db
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();
  if (existing) {
    db.update(userSettings).set({ scheduleIcsUrl: url }).where(eq(userSettings.userId, userId)).run();
  } else {
    db.insert(userSettings).values({ userId, scheduleIcsUrl: url }).run();
  }
}
