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
import { computeMonthlySalary } from '@/lib/salary/monthly';
import { isExtractionConfigured } from '@/lib/payslips/extract';
import type { Payslip } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

type CalculatedPay = { grossPay: number; tax: number; netPay: number };

function withCalculation(rows: Payslip[], userId: number) {
  // One calculation per distinct work month, not one per payslip — a month can
  // hold several documents (a correction, a bonus spec).
  const cache = new Map<string, CalculatedPay | null>();

  return rows.map((row) => {
    const workMonth = workMonthFor(row.payMonth);
    if (!cache.has(workMonth)) {
      const salary = computeMonthlySalary(userId, workMonth);
      cache.set(
        workMonth,
        salary ? { grossPay: salary.grossPay, tax: salary.tax, netPay: salary.netPay } : null,
      );
    }
    const calculated = cache.get(workMonth) ?? null;

    return {
      ...row,
      workMonth,
      calculated,
      diff: calculated
        ? {
            grossPay: row.grossPay === null ? null : row.grossPay - calculated.grossPay,
            tax: row.tax === null ? null : row.tax - calculated.tax,
            netPay: row.netPay === null ? null : row.netPay - calculated.netPay,
          }
        : null,
    };
  });
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

  const amounts = {
    grossPay: parseAmount(form.get('grossPay')),
    tax: parseAmount(form.get('tax')),
    netPay: parseAmount(form.get('netPay')),
  };
  for (const [key, value] of Object.entries(amounts)) {
    if (value === undefined) {
      return NextResponse.json({ error: `Ogiltigt belopp: ${key}` }, { status: 400 });
    }
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
    grossPay: amounts.grossPay as number | null,
    tax: amounts.tax as number | null,
    netPay: amounts.netPay as number | null,
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

  for (const key of ['grossPay', 'tax', 'netPay'] as const) {
    if (body[key] !== undefined) {
      const parsed = parseAmount(body[key]);
      if (parsed === undefined) {
        return NextResponse.json({ error: `Ogiltigt belopp: ${key}` }, { status: 400 });
      }
      fields[key] = parsed;
    }
  }

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
