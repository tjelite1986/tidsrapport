/**
 * DDL for the payslips table, used by the runtime bootstrap in
 * lib/payslips/store.ts. scripts/migrate-v17.ts and scripts/migrate-v18.ts
 * carry the same statements inlined — the runner image has no lib/, so it
 * cannot import them from here.
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

/**
 * Columns added after v17 (migration v18). A table created by the DDL above
 * does not have them, so they are always applied through ALTER TABLE — both on
 * a fresh install and on an existing database. Order matters only for reading.
 */
export const PAYSLIP_EXTRA_COLUMNS: { name: string; ddl: string }[] = [
  { name: 'work_hours', ddl: 'work_hours REAL' },
  { name: 'hourly_rate', ddl: 'hourly_rate REAL' },
  { name: 'base_pay', ddl: 'base_pay REAL' },
  // JSON array of {percent, hours, amount} — one line per OB percentage, the
  // same shape the salary calculation reports as obBreakdown.
  { name: 'ob_lines', ddl: 'ob_lines TEXT' },
  { name: 'total_ob', ddl: 'total_ob REAL' },
  { name: 'overtime_mertid', ddl: 'overtime_mertid REAL' },
  { name: 'overtime_enkel', ddl: 'overtime_enkel REAL' },
  { name: 'overtime_kvalificerad', ddl: 'overtime_kvalificerad REAL' },
  { name: 'sick_pay', ddl: 'sick_pay REAL' },
  { name: 'sick_hours', ddl: 'sick_hours REAL' },
  { name: 'karens_hours', ddl: 'karens_hours REAL' },
  { name: 'vacation_pay', ddl: 'vacation_pay REAL' },
  { name: 'vacation_days_pay', ddl: 'vacation_days_pay REAL' },
  { name: 'vacation_days_count', ddl: 'vacation_days_count REAL' },
];
