import Database from 'better-sqlite3';
import path from 'path';
import { jsPDF } from 'jspdf';
import { calculateMonthlyPay, type PaySettings, type TimeEntryForPay } from '../lib/calculations';
import { calculateOB } from '../lib/calculations/ob';
import { getHourlyRate } from '../lib/calculations/contracts';

const dbPath = process.argv[2] || path.join(process.cwd(), 'data', 'tidsrapport.db');
const db = new Database(dbPath);

// Payslip data from Biltema (hardcoded from PDFs)
const payslips = [
  {
    period: '2025-07', workMonth: '2025-06', label: 'Juni 2025',
    hours: 97.27, mertid: 14.50, sick: 0.98,
    ob50: 8.75, ob70: 0, ob100: 6.00,
    brutto: 19969.08, skatt: 3681, netto: 16288,
    extra: 'Semesterersättning 13%: 2297.33, Karens 1h'
  },
  {
    period: '2025-08', workMonth: '2025-07', label: 'Juli 2025',
    hours: 132.40, mertid: 0.10, sick: 0,
    ob50: 2.50, ob70: 0, ob100: 16.05,
    brutto: 24398.11, skatt: 4905, netto: 19493,
    extra: ''
  },
  {
    period: '2025-09', workMonth: '2025-08', label: 'Augusti 2025',
    hours: 101.42, mertid: 0, sick: 0,
    ob50: 10.25, ob70: 0, ob100: 22.75,
    brutto: 21072.50, skatt: 4012, netto: 17061,
    extra: 'Karens 4.75h'
  },
  {
    period: '2025-10', workMonth: '2025-09', label: 'September 2025',
    hours: 146.90, mertid: 0, sick: 0,
    ob50: 12.88, ob70: 0, ob100: 38.50,
    brutto: 31266.08, skatt: 6892, netto: 24374,
    extra: ''
  },
  {
    period: '2025-11', workMonth: '2025-10', label: 'Oktober 2025',
    hours: 152.58, mertid: 0, sick: 0,
    ob50: 19.08, ob70: 0.08, ob100: 26.00,
    brutto: 30668.93, skatt: 6722, netto: 23947,
    extra: ''
  },
  {
    period: '2025-12', workMonth: '2025-11', label: 'November 2025',
    hours: 154.98, mertid: 0, sick: 0,
    ob50: 11.25, ob70: 0, ob100: 50.07,
    brutto: 34335.81, skatt: 7743, netto: 26593,
    extra: ''
  },
  {
    period: '2026-01', workMonth: '2025-12', label: 'December 2025',
    hours: 119.43, mertid: 0, sick: 13.00,
    ob50: 7.50, ob70: 0.25, ob100: 35.12,
    brutto: 0, skatt: 5803, netto: 0,
    extra: 'Sjuklön OB50: 1.75h, Sjuklön OB100: 5.80h, Karens 6h, VAB 12.25h'
  },
  {
    period: '2026-02', workMonth: '2026-01', label: 'Januari 2026',
    hours: 140.08, mertid: 17.25, sick: 0,
    ob50: 7.00, ob70: 0, ob100: 26.70,
    brutto: 27752.24, skatt: 5643, netto: 22109,
    extra: ''
  },
];

function fmt(n: number): string {
  return n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtKr(n: number): string {
  return n.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' kr';
}

const hourlyRate = getHourlyRate('2ar');
const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

// Title page
doc.setFontSize(22);
doc.text('Lönejämförelse: App vs Lönebesked', 148, 60, { align: 'center' });
doc.setFontSize(14);
doc.text('Thomas Johansson — Biltema Sweden AB', 148, 75, { align: 'center' });
doc.setFontSize(11);
doc.text(`Genererad: ${new Date().toLocaleDateString('sv-SE')}`, 148, 90, { align: 'center' });
doc.text('Timlön: 162,98 kr/h (Handels 2 år)', 148, 100, { align: 'center' });

// Summary page
doc.addPage();
doc.setFontSize(16);
doc.text('Sammanfattning per månad', 15, 18);

// Table header
const cols = [15, 55, 75, 95, 115, 135, 155, 180, 210, 240, 265];
const headers = ['Arbetsperiod', 'Tim (LB)', 'Tim (App)', 'OB50 LB', 'OB50 App', 'OB100 LB', 'OB100 App', 'Brutto LB', 'Brutto App', 'Skatt LB', 'Skatt App'];

let y = 30;
doc.setFontSize(8);
doc.setFont('helvetica', 'bold');
for (let i = 0; i < headers.length; i++) {
  doc.text(headers[i], cols[i], y);
}
doc.setFont('helvetica', 'normal');
doc.line(15, y + 2, 285, y + 2);
y += 7;

for (const ps of payslips) {
  const [wy, wm] = ps.workMonth.split('-');
  const entries = db.prepare(
    `SELECT * FROM time_entries WHERE user_id = 3 AND date >= ? AND date <= ? ORDER BY date`
  ).all(`${ps.workMonth}-01`, `${ps.workMonth}-31`) as any[];

  // Deduplicate
  const seen = new Map<string, any>();
  for (const e of entries) {
    const key = `${e.date}-${e.start_time}-${e.end_time}`;
    if (!seen.has(key)) seen.set(key, e);
  }
  const unique = Array.from(seen.values());

  const payEntries: TimeEntryForPay[] = unique.map((e: any) => ({
    date: e.date, hours: e.hours, startTime: e.start_time, endTime: e.end_time,
    breakMinutes: e.break_minutes, entryType: e.entry_type, overtimeType: e.overtime_type,
  }));

  const taxYear = parseInt(wy);
  const settings: PaySettings = {
    workplaceType: 'butik', contractLevel: '2ar', taxRate: 18.39,
    vacationPayRate: 13, vacationPayMode: 'separate',
    taxMode: 'table', taxTable: 35, taxYear,
  };

  const result = calculateMonthlyPay(payEntries, settings);

  // Calculate OB breakdown
  let appOB50 = 0, appOB70 = 0, appOB100 = 0;
  for (const ob of result.obBreakdown) {
    if (ob.percent === 50) appOB50 = ob.hours;
    else if (ob.percent === 70) appOB70 = ob.hours;
    else if (ob.percent === 100) appOB100 = ob.hours;
  }

  const appHours = unique.reduce((s: number, e: any) => s + e.hours, 0);

  doc.text(ps.label, cols[0], y);
  doc.text(fmt(ps.hours), cols[1], y);
  doc.text(fmt(appHours), cols[2], y);
  doc.text(fmt(ps.ob50), cols[3], y);
  doc.text(fmt(appOB50), cols[4], y);
  doc.text(fmt(ps.ob100), cols[5], y);
  doc.text(fmt(appOB100), cols[6], y);
  doc.text(fmtKr(ps.brutto), cols[7], y);
  doc.text(fmtKr(result.grossPay), cols[8], y);
  doc.text(fmtKr(ps.skatt), cols[9], y);
  doc.text(fmtKr(result.tax), cols[10], y);

  y += 6;
}

// Detailed pages per month
for (const ps of payslips) {
  doc.addPage();
  const [wy, wm] = ps.workMonth.split('-');

  doc.setFontSize(14);
  doc.text(`${ps.label} — Löneperiod ${ps.period}`, 15, 18);

  const entries = db.prepare(
    `SELECT * FROM time_entries WHERE user_id = 3 AND date >= ? AND date <= ? ORDER BY date`
  ).all(`${ps.workMonth}-01`, `${ps.workMonth}-31`) as any[];

  const seen = new Map<string, any>();
  const dupes: any[] = [];
  for (const e of entries) {
    const key = `${e.date}-${e.start_time}-${e.end_time}`;
    if (seen.has(key)) { dupes.push(e); } else { seen.set(key, e); }
  }
  const unique = Array.from(seen.values());

  // Day-by-day table
  const dayCols = [15, 40, 58, 76, 90, 106, 122, 138];
  const dayHeaders = ['Datum', 'Dag', 'Tid', 'Rast', 'Timmar', 'OB 50%', 'OB 100%', 'Anm.'];

  let dy = 28;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  for (let i = 0; i < dayHeaders.length; i++) {
    doc.text(dayHeaders[i], dayCols[i], dy);
  }
  doc.setFont('helvetica', 'normal');
  doc.line(15, dy + 2, 160, dy + 2);
  dy += 6;

  let totalH = 0;
  let tOB50 = 0, tOB70 = 0, tOB100 = 0;
  const dayNames = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];

  for (const e of unique) {
    const d = new Date(e.date + 'T12:00:00');
    const dayName = dayNames[d.getDay()];
    totalH += e.hours;

    let ob50 = 0, ob100 = 0;
    if (e.start_time && e.end_time) {
      const ob = calculateOB(e.date, e.start_time, e.end_time, e.break_minutes, hourlyRate, 'butik');
      for (const seg of ob.segments) {
        if (seg.obPercent === 50) ob50 += seg.hours;
        else if (seg.obPercent === 70) tOB70 += seg.hours;
        else if (seg.obPercent === 100) ob100 += seg.hours;
      }
    }
    tOB50 += ob50;
    tOB100 += ob100;

    const timeStr = e.start_time && e.end_time ? `${e.start_time}-${e.end_time}` : '-';
    let note = '';
    if (e.entry_type === 'sick') note = 'Sjuk';
    if (e.overtime_type !== 'none') note = e.overtime_type;

    doc.text(e.date, dayCols[0], dy);
    doc.text(dayName, dayCols[1], dy);
    doc.text(timeStr, dayCols[2], dy);
    doc.text(String(e.break_minutes || 0), dayCols[3], dy);
    doc.text(e.hours.toFixed(2), dayCols[4], dy);
    doc.text(ob50 > 0 ? ob50.toFixed(2) : '', dayCols[5], dy);
    doc.text(ob100 > 0 ? ob100.toFixed(2) : '', dayCols[6], dy);
    doc.text(note, dayCols[7], dy);
    dy += 5;

    if (dy > 190) {
      doc.addPage();
      dy = 20;
    }
  }

  // Totals
  dy += 3;
  doc.line(15, dy - 2, 160, dy - 2);
  doc.setFont('helvetica', 'bold');
  doc.text('App totalt:', dayCols[0], dy);
  doc.text(totalH.toFixed(2), dayCols[4], dy);
  doc.text(tOB50.toFixed(2), dayCols[5], dy);
  doc.text(tOB100.toFixed(2), dayCols[6], dy);
  doc.setFont('helvetica', 'normal');

  if (dupes.length > 0) {
    dy += 6;
    doc.setTextColor(200, 0, 0);
    doc.text(`OBS: ${dupes.length} dubblettpost(er) borttagna`, dayCols[0], dy);
    doc.setTextColor(0, 0, 0);
  }

  // Comparison table on right side
  const cx = 170;
  let cy = 28;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Jämförelse', cx, cy);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  cy += 8;

  const compRows = [
    ['', 'Lönebesked', 'App', 'Diff'],
    ['Timmar', fmt(ps.hours), fmt(totalH), fmt(totalH - ps.hours)],
    ['Mertid', fmt(ps.mertid), '0,00', fmt(0 - ps.mertid)],
    ['OB 50%', fmt(ps.ob50) + 'h', fmt(tOB50) + 'h', fmt(tOB50 - ps.ob50) + 'h'],
    ['OB 70%', fmt(ps.ob70) + 'h', fmt(tOB70) + 'h', fmt(tOB70 - ps.ob70) + 'h'],
    ['OB 100%', fmt(ps.ob100) + 'h', fmt(tOB100) + 'h', fmt(tOB100 - ps.ob100) + 'h'],
  ];

  // Run salary calc
  const payEntries: TimeEntryForPay[] = unique.map((e: any) => ({
    date: e.date, hours: e.hours, startTime: e.start_time, endTime: e.end_time,
    breakMinutes: e.break_minutes, entryType: e.entry_type, overtimeType: e.overtime_type,
  }));
  const taxYear = parseInt(wy);
  const settings: PaySettings = {
    workplaceType: 'butik', contractLevel: '2ar', taxRate: 18.39,
    vacationPayRate: 13, vacationPayMode: 'separate',
    taxMode: 'table', taxTable: 35, taxYear,
  };
  const result = calculateMonthlyPay(payEntries, settings);

  compRows.push(
    ['Brutto', fmtKr(ps.brutto), fmtKr(result.grossPay), fmtKr(result.grossPay - ps.brutto)],
    ['Skatt', fmtKr(ps.skatt), fmtKr(result.tax), fmtKr(result.tax - ps.skatt)],
    ['Netto', fmtKr(ps.netto), fmtKr(result.netPay), fmtKr(result.netPay - ps.netto)],
  );

  const rcols = [cx, cx + 30, cx + 60, cx + 90];
  for (const row of compRows) {
    if (row[0] === '') {
      doc.setFont('helvetica', 'bold');
    }
    for (let i = 0; i < row.length; i++) {
      doc.text(row[i], rcols[i], cy);
    }
    doc.setFont('helvetica', 'normal');
    cy += 5;
  }

  // Extra notes
  if (ps.extra) {
    cy += 5;
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    const lines = doc.splitTextToSize(`Not: ${ps.extra}`, 110);
    doc.text(lines, cx, cy);
    doc.setTextColor(0, 0, 0);
  }
}

const outPath = path.join(process.cwd(), 'docs', 'lonejamforelse.pdf');
const fs = require('fs');
fs.writeFileSync(outPath, Buffer.from(doc.output('arraybuffer')));
console.log(`PDF sparad: ${outPath}`);

db.close();
