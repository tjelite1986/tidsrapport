import Database from 'better-sqlite3';
import path from 'path';
import { calculateOB } from '../lib/calculations/ob';
import { getHourlyRate } from '../lib/calculations/contracts';

const dbPath = process.argv[2] || path.join(process.cwd(), 'data', 'tidsrapport.db');
const db = new Database(dbPath);

const entries = db.prepare(`SELECT * FROM time_entries WHERE user_id = 3 AND date >= '2025-10-01' AND date <= '2025-10-31' ORDER BY date`).all() as any[];

const hourlyRate = getHourlyRate('2ar');
console.log('Hourly rate:', hourlyRate);

let totalOB50 = 0, totalOB70 = 0, totalOB100 = 0;

for (const e of entries) {
  const d = new Date(e.date + 'T12:00:00');
  const dayNames = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
  const dayName = dayNames[d.getDay()];

  if (!e.start_time || !e.end_time) {
    console.log(`${e.date} (${dayName}): no start/end time`);
    continue;
  }

  const ob = calculateOB(e.date, e.start_time, e.end_time, e.break_minutes, hourlyRate, 'butik');

  let ob50 = 0, ob70 = 0, ob100 = 0;
  for (const seg of ob.segments) {
    if (seg.obPercent === 50) ob50 += seg.hours;
    else if (seg.obPercent === 70) ob70 += seg.hours;
    else if (seg.obPercent === 100) ob100 += seg.hours;
  }

  totalOB50 += ob50;
  totalOB70 += ob70;
  totalOB100 += ob100;

  if (ob50 > 0 || ob70 > 0 || ob100 > 0) {
    console.log(`${e.date} (${dayName}): ${e.start_time}-${e.end_time} break:${e.break_minutes} h:${e.hours} | OB50:${ob50.toFixed(2)} OB70:${ob70.toFixed(2)} OB100:${ob100.toFixed(2)}`);
    for (const seg of ob.segments) {
      if (seg.obPercent > 0) {
        const startH = Math.floor(seg.startMinutes/60);
        const startM = seg.startMinutes%60;
        const endH = Math.floor(seg.endMinutes/60);
        const endM = seg.endMinutes%60;
        console.log(`    ${String(startH).padStart(2,'0')}:${String(startM).padStart(2,'0')}-${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')} = ${seg.hours.toFixed(2)}h @ ${seg.obPercent}%`);
      }
    }
  }
}

console.log(`\nTotals: OB50=${totalOB50.toFixed(2)}h OB70=${totalOB70.toFixed(2)}h OB100=${totalOB100.toFixed(2)}h`);
console.log(`\nPayslip: OB50=19.08h OB70=0.08h OB100=26.00h`);

db.close();
