export async function register() {
  // The sync needs better-sqlite3, so only the Node server runs it — never the
  // edge runtime, and never the build's page-data workers. The import has to
  // sit inside this condition: webpack only drops it from the edge bundle when
  // the NEXT_RUNTIME check wraps it directly, not after an early return.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { startScheduleSync } = await import('./lib/schedule-sync/scheduler');
    startScheduleSync();
  }
}
