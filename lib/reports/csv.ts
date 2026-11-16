// CSV export for /rapporter. Pure so the column order and escaping are locked
// by a test; the page only turns the string into a download.
export interface ReportCsvEntry {
  date: string;
  userName: string;
  projectName: string;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number | null;
  hours: number;
  entryType: string;
  overtimeType: string;
  description: string | null;
}

export const OVERTIME_LABELS: Record<string, string> = {
  none: '-',
  mertid: 'Mertid',
  enkel: 'Enkel ÖT',
  kvalificerad: 'Kval ÖT',
};

export function entryTypeLabel(entryType: string) {
  return entryType === 'sick' ? 'Sjuk' : entryType === 'vab' ? 'VAB' : 'Arb';
}

export function csvField(value: string | number | null | undefined): string {
  const s = String(value ?? '');
  // Quote + escape embedded quotes/commas/newlines per RFC 4180
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const REPORT_CSV_HEADER = 'Datum,Användare,Projekt,Start,Slut,Rast(min),Timmar,Typ,Övertid,Beskrivning';

/** The file body without the BOM; the page prepends ﻿ so Excel reads UTF-8. */
export function buildReportCsv(entries: ReportCsvEntry[]) {
  const rows = entries.map((e) =>
    [
      e.date,
      csvField(e.userName),
      csvField(e.projectName),
      e.startTime || '',
      e.endTime || '',
      e.breakMinutes || 0,
      e.hours,
      e.entryType,
      OVERTIME_LABELS[e.overtimeType] || '-',
      csvField(e.description),
    ].join(','),
  );
  return REPORT_CSV_HEADER + '\n' + rows.join('\n');
}
