/**
 * DDL for the payslips table, shared by scripts/migrate-v17.ts and the runtime
 * bootstrap in lib/payslips/store.ts so the schema is defined in one place.
 */
export const PAYSLIPS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS payslips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    pay_month TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    gross_pay REAL,
    tax REAL,
    net_pay REAL,
    note TEXT,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS payslips_user_month_idx ON payslips(user_id, pay_month);
`;
