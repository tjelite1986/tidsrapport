import { SYNC_INTERVAL_MINUTES, syncAllSchedules } from './store';

const FIRST_RUN_DELAY_MS = 60_000;

// One timer per process, even if register() runs twice in dev
const globalForSync = globalThis as unknown as { scheduleSyncStarted?: boolean };

export function startScheduleSync(): void {
  if (globalForSync.scheduleSyncStarted) return;
  globalForSync.scheduleSyncStarted = true;

  let running = false;
  const run = async () => {
    // A slow feed must not let two passes overlap
    if (running) return;
    running = true;
    try {
      await syncAllSchedules();
    } catch (err) {
      console.error('schedule-sync pass failed:', err);
    } finally {
      running = false;
    }
  };

  setTimeout(run, FIRST_RUN_DELAY_MS);
  setInterval(run, SYNC_INTERVAL_MINUTES * 60_000);
  console.log(`schedule-sync: every ${SYNC_INTERVAL_MINUTES} min`);
}
