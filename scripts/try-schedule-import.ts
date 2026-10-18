/**
 * Manual check: read one or more schedule screenshots with the live AI key and
 * print the resolved month and shifts. Saves nothing.
 *   OPENROUTER_API_KEY=... npx tsx scripts/try-schedule-import.ts docs/sh2.png
 */
import fs from 'fs';
import { detectPayslipType } from '../lib/payslips/files';
import { extractScheduleGrid } from '../lib/schedule-import/extract';
import { resolveSchedule } from '../lib/schedule-import/resolve';

async function main() {
  for (const file of process.argv.slice(2)) {
    const data = fs.readFileSync(file);
    const type = detectPayslipType(data);
    if (!type) throw new Error(`${file}: not an image`);
    const started = Date.now();
    const grid = await extractScheduleGrid({ mimeType: type.mimeType, data });
    const rows = grid.rows.map((r) => `${r.weekNumber ?? '-'}: ${r.cells.map((c) => `${c.day}${c.greyed ? 'g' : ''}${c.startTime ? `[${c.startTime}-${c.endTime}]` : ''}`).join(' ')}`);
    console.log(`\n== ${file} (${grid.provider} ${grid.model}, ${Date.now() - started} ms, hint ${grid.hintMonth})`);
    console.log(rows.join('\n'));
    const resolved = resolveSchedule(grid.rows, { hintMonth: grid.hintMonth });
    console.log(`month ${resolved.month}, matched ${resolved.matchedCells}/${resolved.totalCells}, outside ${resolved.outsideMonth}`);
    for (const s of resolved.shifts) console.log(`  ${s.date} ${s.startTime}-${s.endTime}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
