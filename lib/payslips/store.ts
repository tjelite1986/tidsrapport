import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { db, sqlite } from '@/lib/db';
import { addColumnsIfMissing } from '@/lib/db/add-columns';
import { payslips, type Payslip } from '@/lib/db/schema';
import { PAYSLIPS_TABLE_SQL, PAYSLIP_EXTRA_COLUMNS } from './table';
import { buildStoredName, isSafeStoredName, payslipDir } from './files';
import type { PayslipNumberField } from './fields';

// The table is created here as well as in scripts/migrate-v17.ts so a fresh
// deploy works before anyone has run the migration by hand.
sqlite.exec(PAYSLIPS_TABLE_SQL);

// Same for the v18 line-item columns: applied through addColumnsIfMissing so
// this is idempotent on an existing database and survives two build workers
// reaching the ALTER at the same time.
addColumnsIfMissing(sqlite, 'payslips', PAYSLIP_EXTRA_COLUMNS);

const DATA_DIR = path.join(process.cwd(), 'data');

export function listPayslips(userId: number, year?: number): Payslip[] {
  const conditions = [eq(payslips.userId, userId)];
  if (year) {
    conditions.push(gte(payslips.payMonth, `${year}-01`));
    conditions.push(lte(payslips.payMonth, `${year}-12`));
  }
  return db
    .select()
    .from(payslips)
    .where(and(...conditions))
    .orderBy(desc(payslips.payMonth), desc(payslips.id))
    .all();
}

/** Every year that has at least one payslip, newest first. */
export function listPayslipYears(userId: number): number[] {
  const rows = db.select({ payMonth: payslips.payMonth }).from(payslips).where(eq(payslips.userId, userId)).all();
  const years = new Set(rows.map((r) => parseInt(r.payMonth.slice(0, 4), 10)));
  return [...years].sort((a, b) => b - a);
}

/** Scoped to the owner — another user's id must read as "does not exist". */
export function getPayslip(id: number, userId: number): Payslip | undefined {
  return db
    .select()
    .from(payslips)
    .where(and(eq(payslips.id, id), eq(payslips.userId, userId)))
    .get();
}

export function payslipFilePath(userId: number, storedName: string): string | null {
  if (!isSafeStoredName(storedName)) return null;
  return path.join(payslipDir(DATA_DIR, userId), storedName);
}

export function readPayslipFile(row: Payslip): Buffer | null {
  const filePath = payslipFilePath(row.userId, row.storedName);
  if (!filePath || !fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

/** The amounts typed off a spec — every one of them optional. */
export type PayslipAmountInput = Partial<Record<PayslipNumberField, number | null>> & {
  obLines?: string | null;
};

export function createPayslip(input: {
  userId: number;
  payMonth: string;
  originalName: string;
  mimeType: string;
  extension: string;
  data: Buffer;
  amounts: PayslipAmountInput;
  note: string | null;
}): Payslip {
  const dir = payslipDir(DATA_DIR, input.userId);
  fs.mkdirSync(dir, { recursive: true });

  const storedName = buildStoredName(input.payMonth, randomUUID(), input.extension);
  const filePath = path.join(dir, storedName);

  // Write the file first: an orphan file is recoverable, a row pointing at a
  // file that was never written is not.
  fs.writeFileSync(filePath, input.data);

  try {
    return db
      .insert(payslips)
      .values({
        userId: input.userId,
        payMonth: input.payMonth,
        originalName: input.originalName,
        storedName,
        mimeType: input.mimeType,
        sizeBytes: input.data.length,
        ...input.amounts,
        note: input.note,
      })
      .returning()
      .get();
  } catch (err) {
    fs.rmSync(filePath, { force: true });
    throw err;
  }
}

export function updatePayslipFields(
  id: number,
  userId: number,
  fields: PayslipAmountInput & { payMonth?: string; note?: string | null },
): Payslip | undefined {
  const existing = getPayslip(id, userId);
  if (!existing) return undefined;

  return db
    .update(payslips)
    .set(fields)
    .where(and(eq(payslips.id, id), eq(payslips.userId, userId)))
    .returning()
    .get();
}

export function deletePayslip(id: number, userId: number): boolean {
  const existing = getPayslip(id, userId);
  if (!existing) return false;

  // Row first, file after: a dangling row would show a payslip that cannot be
  // opened, an orphan file only wastes disk.
  db.delete(payslips).where(and(eq(payslips.id, id), eq(payslips.userId, userId))).run();

  const filePath = payslipFilePath(userId, existing.storedName);
  if (filePath) fs.rmSync(filePath, { force: true });
  return true;
}
