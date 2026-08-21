import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MAX_PAYSLIP_BYTES, detectPayslipType } from '@/lib/payslips/files';
import { PayslipExtractionError, extractPayslipFields, isExtractionConfigured } from '@/lib/payslips/extract';

export const dynamic = 'force-dynamic';
// A payslip read can take the better part of a minute on a large scan.
export const maxDuration = 120;

/** Reads amounts off an uploaded payslip without storing anything. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 });

  if (!isExtractionConfigured()) {
    return NextResponse.json({ error: 'AI-avläsning är inte konfigurerad på servern' }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Kunde inte läsa filen' }, { status: 400 });
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Ingen fil vald' }, { status: 400 });
  }
  if (file.size > MAX_PAYSLIP_BYTES) {
    return NextResponse.json({ error: 'Filen är för stor' }, { status: 413 });
  }

  const data = Buffer.from(await file.arrayBuffer());
  const type = detectPayslipType(data);
  if (!type) {
    return NextResponse.json(
      { error: 'Filformatet stöds inte. Ladda upp PDF, PNG, JPG eller WEBP.' },
      { status: 415 },
    );
  }

  try {
    const result = await extractPayslipFields(data, type);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PayslipExtractionError) {
      console.error('Payslip extraction failed:', err.message);
      return NextResponse.json({ error: `AI-avläsningen misslyckades: ${err.message}` }, { status: 502 });
    }
    console.error('Payslip extraction crashed:', err);
    return NextResponse.json({ error: 'AI-avläsningen misslyckades' }, { status: 502 });
  }
}
