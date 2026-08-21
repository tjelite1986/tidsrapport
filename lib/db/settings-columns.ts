/**
 * Columns added to user_settings after the table was first created (migration
 * v19). They carry the header and footer data a payslip needs — employee
 * number, both addresses, bank account, payday and the employer-fee rate —
 * none of which the salary calculation itself uses.
 *
 * scripts/migrate-v19.ts carries the same list inlined: the runner image ships
 * scripts/ but not lib/, so it cannot import from here. Keep the two in step.
 */
export const USER_SETTINGS_EXTRA_COLUMNS: { name: string; ddl: string }[] = [
  { name: 'employee_number', ddl: 'employee_number TEXT' },
  { name: 'employer_org_number', ddl: 'employer_org_number TEXT' },
  { name: 'employer_address', ddl: 'employer_address TEXT' },
  { name: 'employer_zip_city', ddl: 'employer_zip_city TEXT' },
  { name: 'employee_address', ddl: 'employee_address TEXT' },
  { name: 'employee_zip_city', ddl: 'employee_zip_city TEXT' },
  { name: 'bank_account', ddl: 'bank_account TEXT' },
  // Day of the month the salary is paid out — "Utbetalas 2026-03-25".
  { name: 'payday_day', ddl: 'payday_day INTEGER NOT NULL DEFAULT 25' },
  { name: 'payslip_message', ddl: 'payslip_message TEXT' },
  // Employer social fees, shown as "Månadens sociala avgifter". 31.42% is the
  // standard Swedish rate for an employee born 1959-2003.
  { name: 'employer_fee_rate', ddl: 'employer_fee_rate REAL NOT NULL DEFAULT 31.42' },
];

type SqliteLike = {
  pragma(source: string): unknown;
  exec(sql: string): unknown;
};

/**
 * Idempotent: every column is checked against PRAGMA table_info before the
 * ALTER, and a database where user_settings does not exist yet is left alone.
 */
export function applyUserSettingsColumns(sqlite: SqliteLike): void {
  const info = sqlite.pragma('table_info(user_settings)') as { name: string }[];
  if (!Array.isArray(info) || info.length === 0) return;

  const existing = new Set(info.map((c) => c.name));
  for (const column of USER_SETTINGS_EXTRA_COLUMNS) {
    if (!existing.has(column.name)) sqlite.exec(`ALTER TABLE user_settings ADD COLUMN ${column.ddl}`);
  }
}
