import Database from 'better-sqlite3';
import path from 'path';
import { calculateMonthlyPay, type PaySettings, type TimeEntryForPay } from '../lib/calculations';
import { calculateOB } from '../lib/calculations/ob';
import { getHourlyRate } from '../lib/calculations/contracts';

const dbPath = process.argv[2] || path.join(process.cwd(), 'data', 'tidsrapport.db');
const db = new Database(dbPath);

const entries = db.prepare(`SELECT * FROM time_entries WHERE user_id = 3 AND date >= '2026-01-01' AND date <= '2026-01-31' ORDER BY date`).all() as any[];

// Check for duplicates
const seen = new Map<string, any>();
const dupes: any[] = [];
for (const e of entries) {
  const key = `${e.date}-${e.start_time}-${e.end_time}`;
  if (seen.has(key)) {
    dupes.push(e);
  } else {
    seen.set(key, e);
  }
}
if (dupes.length > 0) {
  console.log('=== DUPLICATES FOUND ===');
  for (const d of dupes) {
    console.log(`  ID ${d.id}: ${d.date} ${d.start_time}-${d.end_time} h:${d.hours}`);
  }
  console.log('');
}

// Use unique entries only
const uniqueEntries = Array.from(seen.values());
const hourlyRate = getHourlyRate('2ar');

console.log('=== OB per dag (unika poster) ===');
let totalOB50 = 0, totalOB70 = 0, totalOB100 = 0;
for (const e of uniqueEntries) {
  if (!e.start_time || !e.end_time) continue;
  const d = new Date(e.date + 'T12:00:00');
  const days = ['Sön','Mån','Tis','Ons','Tor','Fre','Lör'];
  const ob = calculateOB(e.date, e.start_time, e.end_time, e.break_minutes, hourlyRate, 'butik');
  let ob50 = 0, ob70 = 0, ob100 = 0;
  for (const seg of ob.segments) {
    if (seg.obPercent === 50) ob50 += seg.hours;
    else if (seg.obPercent === 70) ob70 += seg.hours;
    else if (seg.obPercent === 100) ob100 += seg.hours;
  }
  totalOB50 += ob50; totalOB70 += ob70; totalOB100 += ob100;
  if (ob50 > 0 || ob70 > 0 || ob100 > 0) {
    console.log(`${e.date} (${days[d.getDay()]}): ${e.start_time}-${e.end_time} brk:${e.break_minutes} h:${e.hours} | OB50:${ob50.toFixed(2)} OB100:${ob100.toFixed(2)}`);
  }
}
console.log(`\nOB totaler: OB50=${totalOB50.toFixed(2)}h OB100=${totalOB100.toFixed(2)}h`);

// Run full salary calc with unique entries
const payEntries: TimeEntryForPay[] = uniqueEntries.map((e: any) => ({
  date: e.date, hours: e.hours, startTime: e.start_time, endTime: e.end_time,
  breakMinutes: e.break_minutes, entryType: e.entry_type, overtimeType: e.overtime_type,
}));

const settings: PaySettings = {
  workplaceType: 'butik', contractLevel: '2ar', taxRate: 18.39,
  vacationPayRate: 13, vacationPayMode: 'separate',
  taxMode: 'table', taxTable: 35, taxYear: 2026,
};

const result = calculateMonthlyPay(payEntries, settings);
let totalH = uniqueEntries.reduce((s: number, e: any) => s + e.hours, 0);

console.log('\n=== Vår beräkning (unika poster) ===');
console.log('Timmar:', totalH.toFixed(2));
console.log('Grundlön:', result.basePay.toFixed(2));
console.log('OB totalt:', result.totalOB.toFixed(2));
console.log('Mertid:', result.overtidMertid.toFixed(2));
console.log('Brutto:', result.grossPay.toFixed(2));
console.log('Skatt:', result.tax.toFixed(2));
console.log('Netto:', result.netPay.toFixed(2));

console.log('\n=== Lönebesked Feb 2026 (arbete jan) ===');
console.log('Timlön: 122.83h × 162.98 = 20018.83');
console.log('Mertid: 17.25h × 162.98 = 2811.41');
console.log('OB 50%: 7.00h × 81.49 = 570.43');
console.log('OB 100%: 26.70h × 162.98 = 4351.57');
console.log('Brutto: 27752.24');
console.log('Skatt: -5643.00');
console.log('Utbetalas: 22109.00');
console.log('Total timmar: 140.08 (122.83 + 17.25)');

console.log('\n=== Diff ===');
console.log('Timmar:', (totalH - 140.08).toFixed(2));
console.log('Brutto:', (result.grossPay - 27752.24).toFixed(2));
console.log('Skatt:', (result.tax - 5643).toFixed(2));

db.close();
