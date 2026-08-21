import path from 'path';

/** Largest payslip we accept. Employer PDFs are a few hundred KB; scans of a
 *  printed spec can be a couple of MB. */
export const MAX_PAYSLIP_BYTES = 10 * 1024 * 1024;

export type PayslipFileType = {
  mimeType: string;
  extension: string;
};

const PDF = { mimeType: 'application/pdf', extension: '.pdf' };
const PNG = { mimeType: 'image/png', extension: '.png' };
const JPEG = { mimeType: 'image/jpeg', extension: '.jpg' };
const WEBP = { mimeType: 'image/webp', extension: '.webp' };

/**
 * Identify an upload from its bytes, not from the name or the browser-supplied
 * MIME type — both are claims the client makes. Returns null for anything that
 * is not a PDF or a still image we can render back.
 */
export function detectPayslipType(buffer: Buffer): PayslipFileType | null {
  if (buffer.length < 12) return null;

  // %PDF-
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2d) {
    return PDF;
  }
  // \x89PNG\r\n\x1a\n
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return PNG;
  }
  // JPEG SOI + marker
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return JPEG;
  }
  // RIFF....WEBP
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return WEBP;
  }
  return null;
}

/** YYYY-MM, the payout month printed on the payslip. */
export function isValidPayMonth(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}

/** The work month a payout month covers — pay lands the month after the work. */
export function workMonthFor(payMonth: string): string {
  const [year, month] = payMonth.split('-').map(Number);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Keep the user's file name for display, but strip anything that could travel
 * out of the payslip directory or confuse a Content-Disposition header.
 */
export function sanitizeOriginalName(name: string): string {
  const base = path.basename(name).replace(/[\r\n"\\]/g, '').replace(/[\u0000-\u001f]/g, '').trim();
  const cleaned = base.replace(/^\.+/, '');
  if (!cleaned) return 'lonespec';
  return cleaned.slice(0, 120);
}

/** Storage name is ours, never the client's: pay month + a random token. */
export function buildStoredName(payMonth: string, token: string, extension: string): string {
  return `${payMonth}-${token}${extension}`;
}

/** Reject any stored name that is not exactly the shape buildStoredName makes. */
export function isSafeStoredName(name: string): boolean {
  return /^\d{4}-\d{2}-[0-9a-f-]{8,64}\.(pdf|png|jpg|webp)$/.test(name);
}

export function payslipDir(dataDir: string, userId: number): string {
  return path.join(dataDir, 'payslips', String(userId));
}

/**
 * Parse an amount the way it is printed on a Swedish payslip: "32 450,00",
 * "32450.00", "1 234 kr". Returns null for blank input and NaN-ish garbage so
 * the caller can tell "not filled in" from "typed wrong".
 */
export function parseAmount(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw
    .replace(/\s| /g, '')
    .replace(/kr$/i, '')
    .replace(/,/g, '.');
  const n = Number(normalized);
  if (!Number.isFinite(n)) return undefined; // undefined = invalid input
  return n;
}
