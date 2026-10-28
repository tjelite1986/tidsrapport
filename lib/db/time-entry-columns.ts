/**
 * Columns added to time_entries after the table was first created (migration
 * v30). Every drizzle select of time_entries names them, so they have to exist
 * before the first query — this runs at module init in lib/db/index.ts.
 *
 * scripts/migrate-v30.ts carries the same list inlined: the runner image ships
 * scripts/ but not lib/, so it cannot import from here. Keep the two in step.
 */
import { addColumnsIfMissing, type SqliteLike } from './add-columns';

export const TIME_ENTRY_EXTRA_COLUMNS: { name: string; ddl: string }[] = [
  // v30: hourly rate for this one shift (substitute shift, temporary rate).
  // NULL = the normal rate from rate history / flat rate / contract table.
  { name: 'hourly_rate_override', ddl: 'hourly_rate_override REAL' },
];

export function applyTimeEntryColumns(sqlite: SqliteLike): void {
  addColumnsIfMissing(sqlite, 'time_entries', TIME_ENTRY_EXTRA_COLUMNS);
}
