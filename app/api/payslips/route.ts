import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  createPayslip,
  deletePayslip,
  listPayslipYears,
  listPayslips,
  updatePayslipFields,
} from '@/lib/payslips/store';
import {
  MAX_PAYSLIP_BYTES,
  detectPayslipType,
  isValidPayMonth,
  parseAmount,
  sanitizeOriginalName,
  workMonthFor,
} from '@/lib/payslips/files';
import {
  PAYSLIP_NUMBER_FIELDS,
  buildComparison,
  parseObLines,
  readObLines,
  serializeObLines,
} from '@/lib/payslips/fields';
import type { PayslipAmountInput } from '@/lib/payslips/store';
import { computeMonthlySalary } from '@/lib/salary/monthly';
import { isExtractionConfigured } from '@/lib/payslips/extract';
import type { Payslip } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

type MonthlySalary = ReturnType<typeof computeMonthlySalary>;

function withCalculation(rows: Payslip[], userId: number) {
  // One calculation per distinct work month, not one per payslip — a month can
  // hold several documents (a correction, a bonus spec).
  const cache = new Map<string, MonthlySalary>();

  return rows.map((row) => {
    const workMonth = workMonthFor(row.payMonth);
    if (!cache.has(workMonth)) {
      cache.set(workMonth, computeMonthlySalary(userId, workMonth));
    }
    const salary = cache.get(workMonth) ?? null;

    return {
      ...row,
      workMonth,
      // The OB lines travel as parsed objects; the column itself is JSON text
      obLines: readObLines(row.obLines),
      calculated: salary
        ? {
            workHours: salary.workHours,
            hourlyRate: salary.hourlyRate,
            basePay: salary.basePay,
            obBreakdown: salary.obBreakdown,
            totalOB: salary.totalOB,
            overtimeMertid: salary.overtidMertid,
            overtimeEnkel: salary.overtidEnkel,
            overtimeKvalificerad: salary.overtidKvalificerad,
            sickPay: salary.sickPay,
            vacationPay: salary.vacationPayPaid,
            vacationDaysPay: salary.vacationDaysPay,
            vacationDaysCount: salary.vacationDaysCount,
            grossPay: salary.grossPay,
            tax: salary.tax,
            netPay: salary.netPay,
          }
        : null,
      comparison: buildComparison(row, salary),
    };
  });
}

/**
 * Read every amount field off a form or a JSON body.
 *
 * Returns the field name that failed to parse instead of the values, so the
 * caller can name it in the 400 — a silently dropped amount would show up as
 * a diff against the app's calculation.
 */
function readAmounts(
  get: (key: string) => unknown,
  { onlyPresent }: { onlyPresent: boolean },
): { amounts: PayslipAmountInput } | { invalid: string } {
  const amounts: PayslipAmountInput = {};

  for (const key of PAYSLIP_NUMBER_FIELDS) {
    const raw = get(key);
    if (onlyPresent && raw === undefined) continue;
    const parsed = parseAmount(raw);
    if (parsed === undefined) return { invalid: key };
    amounts[key] = parsed;
  }

  const rawObLines = get('obLines');
  if (!onlyPresent || rawObLines !== undefined) {
    const lines = parseObLines(rawObLines);
    if (lines === undefined) return { invalid: 'obLines' };
    amounts.obLines = serializeObLines(lines);
  }

  return { amounts };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const yearParam = req.nextUrl.searchParams.get('year');
  const year = yearParam ? parseInt(yearParam, 10) : undefined;
  if (yearParam && (!Number.isInteger(year) || year! < 2000 || year! > 2100)) {
    return NextResponse.json({ error: 'Ogiltigt år' }, { status: 400 });
  }

  const rows = listPayslips(userId, year);

  return NextResponse.json({
    year: year ?? null,
    years: listPayslipYears(userId),
    // The upload form hides the AI button when the server has no key
    aiEnabled: isExtractionConfigured(),
    payslips: withCalculation(rows, userId),
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Kunde inte läsa uppladdningen' }, { status: 400 });
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Ingen fil vald' }, { status: 400 });
  }

  const payMonth = form.get('payMonth');
  if (!isValidPayMonth(payMonth)) {
    return NextResponse.json({ error: 'Ogiltig utbetalningsmånad (YYYY-MM)' }, { status: 400 });
  }

  if (file.size > MAX_PAYSLIP_BYTES) {
    return NextResponse.json(
      { error: `Filen är för stor (max ${Math.round(MAX_PAYSLIP_BYTES / 1024 / 1024)} MB)` },
      { status: 413 },
    );
  }

  const data = Buffer.from(await file.arrayBuffer());
  if (data.length === 0) {
    return NextResponse.json({ error: 'Filen är tom' }, { status: 400 });
  }
  if (data.length > MAX_PAYSLIP_BYTES) {
    return NextResponse.json({ error: 'Filen är för stor' }, { status: 413 });
  }

  // The extension and the browser's MIME type are claims; the bytes decide.
  const detected = detectPayslipType(data);
  if (!detected) {
    return NextResponse.json(
      { error: 'Filformatet stöds inte. Ladda upp PDF, PNG, JPG eller WEBP.' },
      { status: 415 },
    );
  }

  const parsedAmounts = readAmounts((key) => form.get(key), { onlyPresent: false });
  if ('invalid' in parsedAmounts) {
    return NextResponse.json({ error: `Ogiltigt värde: ${parsedAmounts.invalid}` }, { status: 400 });
  }

  const noteRaw = form.get('note');
  const note = typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim().slice(0, 500) : null;

  const row = createPayslip({
    userId,
    payMonth,
    originalName: sanitizeOriginalName(typeof file.name === 'string' ? file.name : 'lonespec'),
    mimeType: detected.mimeType,
    extension: detected.extension,
    data,
    amounts: parsedAmounts.amounts,
    note,
  });

  return NextResponse.json({ payslip: withCalculation([row], userId)[0] }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== 'number') {
    return NextResponse.json({ error: 'id saknas' }, { status: 400 });
  }

  const fields: Parameters<typeof updatePayslipFields>[2] = {};

  if (body.payMonth !== undefined) {
    if (!isValidPayMonth(body.payMonth)) {
      return NextResponse.json({ error: 'Ogiltig utbetalningsmånad (YYYY-MM)' }, { status: 400 });
    }
    fields.payMonth = body.payMonth;
  }

  const parsedAmounts = readAmounts((key) => body[key], { onlyPresent: true });
  if ('invalid' in parsedAmounts) {
    return NextResponse.json({ error: `Ogiltigt värde: ${parsedAmounts.invalid}` }, { status: 400 });
  }
  Object.assign(fields, parsedAmounts.amounts);

  if (body.note !== undefined) {
    fields.note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'Inget att uppdatera' }, { status: 400 });
  }

  const row = updatePayslipFields(body.id, userId, fields);
  if (!row) return NextResponse.json({ error: 'Lönespecen hittades inte' }, { status: 404 });

  return NextResponse.json({ payslip: withCalculation([row], userId)[0] });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  const userId = parseInt(session.user.id);
  const id = parseInt(req.nextUrl.searchParams.get('id') ?? '', 10);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id saknas' }, { status: 400 });

  if (!deletePayslip(id, userId)) {
    return NextResponse.json({ error: 'Lönespecen hittades inte' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
