import Database from 'better-sqlite3';
import path from 'path';
import { calculateMonthlyPay, type PaySettings, type TimeEntryForPay } from '../lib/calculations';

const dbPath = process.argv[2] || path.join(process.cwd(), 'data', 'tidsrapport.db');
const db = new Database(dbPath);

const entries = db.prepare(`SELECT * FROM time_entries WHERE user_id = 3 AND date >= '2025-10-01' AND date <= '2025-10-31' ORDER BY date`).all() as any[];

const payEntries: TimeEntryForPay[] = entries.map((e: any) => ({
  date: e.date,
  hours: e.hours,
  startTime: e.start_time,
  endTime: e.end_time,
  breakMinutes: e.break_minutes,
  entryType: e.entry_type,
  overtimeType: e.overtime_type,
}));

const settings: PaySettings = {
  workplaceType: 'butik',
  contractLevel: '2ar',
  taxRate: 18.39,
  vacationPayRate: 13,
  vacationPayMode: 'separate',
  hourlyRate: undefined,
  taxMode: 'table',
  taxTable: 35,
  taxYear: 2025,
};

const result = calculateMonthlyPay(payEntries, settings);

console.log('=== Vår beräkning ===');
console.log('Timmar:', result.totalHours.toFixed(2));
console.log('Timlön:', result.hourlyRate);
console.log('Grundlön:', result.basePay.toFixed(2));
console.log('OB totalt:', result.totalOB.toFixed(2));
console.log('OB breakdown:');
for (const ob of result.obBreakdown) {
  console.log(`  OB ${ob.percent}%: ${ob.hours.toFixed(2)} tim = ${ob.amount.toFixed(2)} kr`);
}
console.log('Brutto (före semester):', result.grossBeforeVacation.toFixed(2));
console.log('Semesterersättning:', result.vacationPay.toFixed(2));
console.log('Brutto (grossPay):', result.grossPay.toFixed(2));
console.log('Skatt:', result.tax.toFixed(2));
console.log('Netto:', result.netPay.toFixed(2));

console.log('');
console.log('=== Lönebesked Nov 2025 (arbete okt) ===');
console.log('Timmar: 152.58');
console.log('Timlön: 162.98');
console.log('Grundlön: 24 867.49');
console.log('OB 50%: 19.08 tim = 1 554.83');
console.log('OB 70%: 0.08 tim = 9.13');
console.log('OB 100%: 26.00 tim = 4 237.48');
console.log('OB totalt: 5 801.44');
console.log('Brutto: 30 668.93');
console.log('Skatt: -6 722.00');
console.log('Utbetalas: 23 947.00');

console.log('');
console.log('=== Diff (vår - lönebesked) ===');
console.log('Timmar:', (result.totalHours - 152.58).toFixed(2));
console.log('Grundlön:', (result.basePay - 24867.49).toFixed(2));
console.log('OB totalt:', (result.totalOB - 5801.44).toFixed(2));
console.log('Brutto:', (result.grossPay - 30668.93).toFixed(2));
console.log('Skatt:', (result.tax - 6722).toFixed(2));
console.log('Netto:', (result.netPay - 23947).toFixed(2));

db.close();
