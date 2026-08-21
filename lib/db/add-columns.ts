/**
 * ALTER TABLE ... ADD COLUMN for the runtime bootstraps, safe to run twice at
 * once.
 *
 * Next.js collects page data in several worker processes in parallel and they
 * all open the same SQLite file, so two of them can read PRAGMA table_info
 * before either has run its ALTER. Checking the pragma is therefore not enough
 * on its own — whichever process loses the race has to read "duplicate column
 * name" as "already applied" rather than as a failure.
 */

export type SqliteLike = {
  pragma(source: string): unknown;
  exec(sql: string): unknown;
};

export type ColumnDef = { name: string; ddl: string };

function isDuplicateColumn(err: unknown): boolean {
  return err instanceof Error && /duplicate column name/i.test(err.message);
}

export function addColumnsIfMissing(sqlite: SqliteLike, table: string, columns: ColumnDef[]): void {
  const info = sqlite.pragma(`table_info(${table})`) as { name: string }[];
  if (!Array.isArray(info) || info.length === 0) return;

  const existing = new Set(info.map((c) => c.name));
  for (const column of columns) {
    if (existing.has(column.name)) continue;
    try {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column.ddl}`);
    } catch (err) {
      if (!isDuplicateColumn(err)) throw err;
    }
  }
}
