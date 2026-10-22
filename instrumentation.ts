export async function register() {
  // The sync needs better-sqlite3, so only the Node server runs it — never the
  // edge runtime, and never the build's page-data workers
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { startScheduleSync } = await import('./lib/schedule-sync/scheduler');
  startScheduleSync();
}
