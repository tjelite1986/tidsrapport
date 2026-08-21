import { describe, it, expect } from 'vitest';
import {
  buildStoredName,
  detectPayslipType,
  isSafeStoredName,
  isValidPayMonth,
  parseAmount,
  payslipDir,
  sanitizeOriginalName,
  workMonthFor,
} from './files';

function bytes(...values: number[]): Buffer {
  return Buffer.concat([Buffer.from(values), Buffer.alloc(16)]);
}

describe('detectPayslipType', () => {
  it('identifies a PDF by its magic bytes', () => {
    expect(detectPayslipType(Buffer.from('%PDF-1.7\n%âãÏÓ\n'))).toEqual({
      mimeType: 'application/pdf',
      extension: '.pdf',
    });
  });

  it('identifies PNG, JPEG and WEBP', () => {
    expect(detectPayslipType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.extension).toBe('.png');
    expect(detectPayslipType(bytes(0xff, 0xd8, 0xff, 0xe0))?.extension).toBe('.jpg');
    expect(
      detectPayslipType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]))
        ?.extension,
    ).toBe('.webp');
  });

  it('rejects content that only claims to be a payslip', () => {
    // An HTML login wall saved as lonespec.pdf must not be stored as a PDF
    expect(detectPayslipType(Buffer.from('<!doctype html><html>Logga in</html>'))).toBeNull();
    expect(detectPayslipType(Buffer.from('PK\x03\x04 zip payload here'))).toBeNull();
    expect(detectPayslipType(Buffer.from('%PDF'))).toBeNull(); // too short to be anything
  });
});

describe('isValidPayMonth', () => {
  it('accepts YYYY-MM inside a sane range', () => {
    expect(isValidPayMonth('2026-08')).toBe(true);
    expect(isValidPayMonth('2000-01')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidPayMonth('2026-13')).toBe(false);
    expect(isValidPayMonth('2026-00')).toBe(false);
    expect(isValidPayMonth('2026-8')).toBe(false);
    expect(isValidPayMonth('1999-12')).toBe(false);
    expect(isValidPayMonth(202608)).toBe(false);
    expect(isValidPayMonth(undefined)).toBe(false);
  });
});

describe('workMonthFor', () => {
  it('maps a payout month to the month worked', () => {
    expect(workMonthFor('2026-08')).toBe('2026-07');
  });

  it('crosses the year boundary without a UTC shift', () => {
    expect(workMonthFor('2026-01')).toBe('2025-12');
  });
});

describe('sanitizeOriginalName', () => {
  it('keeps a normal Swedish file name', () => {
    expect(sanitizeOriginalName('Lönespec augusti 2026.pdf')).toBe('Lönespec augusti 2026.pdf');
  });

  it('strips path traversal and header-breaking characters', () => {
    expect(sanitizeOriginalName('../../etc/passwd')).toBe('passwd');
    // basename() keeps only the last path segment, then the leading dot goes
    expect(sanitizeOriginalName('spec"; rm -rf /.pdf')).toBe('pdf');
    expect(sanitizeOriginalName('spec"; rm -rf .pdf')).toBe('spec; rm -rf .pdf');
    expect(sanitizeOriginalName('bad\r\nname.pdf')).toBe('badname.pdf');
    expect(sanitizeOriginalName('...')).toBe('lonespec');
    expect(sanitizeOriginalName('   ')).toBe('lonespec');
  });

  it('caps the length', () => {
    expect(sanitizeOriginalName('a'.repeat(300)).length).toBe(120);
  });
});

describe('stored names', () => {
  it('round-trips what buildStoredName produces', () => {
    const name = buildStoredName('2026-08', '0f8fad5b-d9cb-469f-a165-70867728950e', '.pdf');
    expect(name).toBe('2026-08-0f8fad5b-d9cb-469f-a165-70867728950e.pdf');
    expect(isSafeStoredName(name)).toBe(true);
  });

  it('refuses names that could escape the payslip directory', () => {
    expect(isSafeStoredName('../tidsrapport.db')).toBe(false);
    expect(isSafeStoredName('2026-08-abc/../../x.pdf')).toBe(false);
    expect(isSafeStoredName('2026-08-abcdef12.exe')).toBe(false);
    expect(isSafeStoredName('tidsrapport.db')).toBe(false);
  });
});

describe('payslipDir', () => {
  it('scopes storage per user', () => {
    expect(payslipDir('/app/data', 7)).toBe('/app/data/payslips/7');
  });
});

describe('parseAmount', () => {
  it('reads amounts the way a payslip prints them', () => {
    expect(parseAmount('32 450,00')).toBe(32450);
    expect(parseAmount('32450.50')).toBe(32450.5);
    expect(parseAmount('1 234 kr')).toBe(1234);
    expect(parseAmount('-500,25')).toBe(-500.25);
    expect(parseAmount(29800)).toBe(29800);
  });

  it('tells blank apart from garbage', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
    expect(parseAmount('trettiotusen')).toBeUndefined();
    expect(parseAmount('12,34,56')).toBeUndefined();
  });
});
