import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { and, eq, gte, lte } from 'drizzle-orm';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { timeEntries } from '@/lib/db/schema';
import { detectPayslipType, MAX_PAYSLIP_BYTES } from '@/lib/payslips/files';
import { isVisionConfigured } from '@/lib/ai/vision-json';
import { extractScheduleGrid, ScheduleExtractionError } from '@/lib/schedule-import/extract';
import { resolveSchedule, ScheduleResolveError } from '@/lib/schedule-import/resolve';

export const dynamic = 'force-dynamic';

/**
 * Read a schedule screenshot and answer with dated shifts for the month it
 * shows. Saves nothing — the client confirms and posts the entries itself.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isVisionConfigured()) {
    return NextResponse.json({ error: 'No AI key configured on the server' }, { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  }
  const file = formData.get('image');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No image uploaded' }, { status: 400 });
  if (file.size > MAX_PAYSLIP_BYTES) return NextResponse.json({ error: 'Image is larger than 10 MB' }, { status: 413 });

  const data = Buffer.from(await file.arrayBuffer());
  // The bytes decide the type, not the browser's claim
  const type = detectPayslipType(data);
  if (!type || type.mimeType === 'application/pdf') {
    return NextResponse.json({ error: 'Unsupported file type. Use PNG, JPG or WEBP.' }, { status: 415 });
  }

  try {
    const grid = await extractScheduleGrid({ mimeType: type.mimeType, data });
    const resolved = resolveSchedule(grid.rows, { hintMonth: grid.hintMonth });

    // Mark dates the user already has entries on, so a re-upload does not
    // double every shift
    const userId = parseInt(session.user.id);
    const existingDates = new Set<string>();
    if (resolved.shifts.length > 0) {
      const first = resolved.shifts[0].date;
      const last = resolved.shifts[resolved.shifts.length - 1].date;
      const rows = db
        .select({ date: timeEntries.date })
        .from(timeEntries)
        .where(and(eq(timeEntries.userId, userId), gte(timeEntries.date, first), lte(timeEntries.date, last)))
        .all();
      for (const row of rows) existingDates.add(row.date);
    }

    return NextResponse.json({
      month: resolved.month,
      shifts: resolved.shifts.map((s) => ({ ...s, existing: existingDates.has(s.date) })),
      outsideMonth: resolved.outsideMonth,
      matchedCells: resolved.matchedCells,
      totalCells: resolved.totalCells,
      provider: grid.provider,
      model: grid.model,
    });
  } catch (err) {
    if (err instanceof ScheduleExtractionError || err instanceof ScheduleResolveError) {
      console.error('schedule-import:', err.message);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error('schedule-import failed:', err);
    return NextResponse.json({ error: 'Schedule analysis failed' }, { status: 500 });
  }
}
