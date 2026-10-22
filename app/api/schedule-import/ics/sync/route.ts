import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { and, eq } from 'drizzle-orm';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, userSettings } from '@/lib/db/schema';
import { IcsFetchError, normalizeIcsUrl } from '@/lib/schedule-import/fetch-ics';
import { syncScheduleForUser } from '@/lib/schedule-sync/store';

export const dynamic = 'force-dynamic';

/**
 * Switch the automatic schedule sync on or off. Switching it on saves the
 * link and project and runs a sync straight away, so the user sees the
 * result instead of waiting up to half an hour.
 */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = parseInt(session.user.id);

  const body = await req.json().catch(() => ({}));
  const enabled = body.enabled === true;

  if (!enabled) {
    db.update(userSettings).set({ scheduleSyncEnabled: false }).where(eq(userSettings.userId, userId)).run();
    return NextResponse.json({ enabled: false });
  }

  const projectId = Number(body.projectId);
  const owned = Number.isInteger(projectId) && db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .get();
  if (!owned) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  let url: string;
  try {
    url = normalizeIcsUrl(String(body.url ?? '')).toString();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid URL' }, { status: 400 });
  }

  const values = { scheduleIcsUrl: url, scheduleSyncEnabled: true, scheduleSyncProjectId: projectId };
  const existing = db.select({ id: userSettings.id }).from(userSettings).where(eq(userSettings.userId, userId)).get();
  if (existing) db.update(userSettings).set(values).where(eq(userSettings.userId, userId)).run();
  else db.insert(userSettings).values({ userId, ...values }).run();

  try {
    const result = await syncScheduleForUser(userId);
    return NextResponse.json({ enabled: true, result, ...syncStatus(userId) });
  } catch (err) {
    const status = err instanceof IcsFetchError ? err.status : 502;
    return NextResponse.json(
      { enabled: true, error: err instanceof Error ? err.message : 'Sync failed', ...syncStatus(userId) },
      { status },
    );
  }
}

function syncStatus(userId: number) {
  const row = db
    .select({ syncedAt: userSettings.scheduleSyncedAt, status: userSettings.scheduleSyncStatus })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();
  return { syncedAt: row?.syncedAt ?? null, status: row?.status ?? null };
}
