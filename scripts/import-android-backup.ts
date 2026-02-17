import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const backupPath = process.argv[2];
if (!backupPath) {
  console.error('Usage: npx tsx scripts/import-android-backup.ts <backup.json> [userId]');
  process.exit(1);
}

const userId = parseInt(process.argv[3] || '1');

const dbDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dbDir, 'tidsrapport.db');
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
const entries = backup.entries || [];
const settings = backup.settings || {};

console.log(`Importing ${entries.length} entries for user ${userId}...`);

// Check for default project, create if needed
let project = sqlite.prepare('SELECT id FROM projects WHERE name = ?').get('Arbete') as { id: number } | undefined;
if (!project) {
  const result = sqlite.prepare(
    "INSERT INTO projects (name, description, active, created_at) VALUES ('Arbete', 'Importerat från Android-appen', 1, ?)"
  ).run(new Date().toISOString());
  project = { id: Number(result.lastInsertRowid) };
  console.log(`Created project "Arbete" with id ${project.id}`);
}

// Get existing dates to avoid duplicates
const existingDates = new Set(
  (sqlite.prepare('SELECT date FROM time_entries WHERE user_id = ?').all(userId) as { date: string }[])
    .map((r) => r.date)
);

const insert = sqlite.prepare(`
  INSERT INTO time_entries (user_id, project_id, date, hours, start_time, end_time, break_minutes, entry_type, overtime_type, description, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let imported = 0;
let skipped = 0;

const transaction = sqlite.transaction(() => {
  for (const entry of entries) {
    if (existingDates.has(entry.date)) {
      skipped++;
      continue;
    }

    const entryType = entry.isSickDay ? 'sick' : 'work';
    const hours = entry.workHours || 0;
    const startTime = entry.startTime || null;
    const endTime = entry.endTime || null;
    const breakMinutes = entry.breakMinutes || 0;

    insert.run(
      userId,
      project.id,
      entry.date,
      hours,
      startTime,
      endTime,
      breakMinutes,
      entryType,
      'none',
      null,
      new Date().toISOString()
    );
    imported++;
  }
});

transaction();

console.log(`Imported: ${imported}, Skipped (duplicate dates): ${skipped}`);

// Import settings if available
if (settings.employeeName || settings.employerName) {
  const contractMap: Record<string, string> = {
    'EXPERIENCE_2_YEARS': '2ar',
    'EXPERIENCE_3_PLUS_YEARS': '3plus',
    'EXPERIENCE_1_YEAR': '1ar_erf',
    'AGE_18': '18ar',
    'AGE_19': '19ar',
    'AGE_16': '16ar',
    'AGE_17': '17ar',
  };

  const workplaceMap: Record<string, string> = {
    'BUTIK': 'butik',
    'LAGER': 'lager',
  };

  const vacationModeMap: Record<string, string> = {
    'SEPARATE_ACCUMULATION': 'separate',
    'INCLUDED_IN_HOURLY': 'included',
  };

  const existingSettings = sqlite.prepare('SELECT id FROM user_settings WHERE user_id = ?').get(userId) as { id: number } | undefined;

  const data = {
    workplaceType: workplaceMap[settings.obRates?.workplaceType] || 'none',
    contractLevel: contractMap[settings.contractLevel] || '3plus',
    taxRate: settings.taxRate || 30,
    vacationPayRate: settings.vacationRate || 12,
    vacationPayMode: vacationModeMap[settings.vacationPaymentMode] || 'included',
    employeeName: (settings.employeeName || '').trim(),
    employerName: (settings.employerName || '').trim(),
    defaultStartTime: settings.workTimeSettings?.defaultStartTime || null,
    defaultEndTime: settings.workTimeSettings?.defaultEndTime || null,
    calendarViewDefault: settings.calendarSettings?.monthViewAsDefault ? 'month' : 'week',
    taxMode: settings.useTaxTable ? 'table' : 'percentage',
  };

  if (existingSettings) {
    sqlite.prepare(`
      UPDATE user_settings SET
        workplace_type = ?, contract_level = ?, tax_rate = ?,
        vacation_pay_rate = ?, vacation_pay_mode = ?,
        employee_name = ?, employer_name = ?,
        default_start_time = ?, default_end_time = ?,
        calendar_view_default = ?, tax_mode = ?
      WHERE user_id = ?
    `).run(
      data.workplaceType, data.contractLevel, data.taxRate,
      data.vacationPayRate, data.vacationPayMode,
      data.employeeName, data.employerName,
      data.defaultStartTime, data.defaultEndTime,
      data.calendarViewDefault, data.taxMode,
      userId
    );
    console.log('Updated user settings from backup');
  } else {
    sqlite.prepare(`
      INSERT INTO user_settings (user_id, workplace_type, contract_level, tax_rate, vacation_pay_rate, vacation_pay_mode, employee_name, employer_name, default_start_time, default_end_time, calendar_view_default, tax_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, data.workplaceType, data.contractLevel, data.taxRate,
      data.vacationPayRate, data.vacationPayMode,
      data.employeeName, data.employerName,
      data.defaultStartTime, data.defaultEndTime,
      data.calendarViewDefault, data.taxMode
    );
    console.log('Created user settings from backup');
  }
}

// Import accumulated vacation pay as a note
if (settings.accumulatedVacationPay && settings.accumulatedVacationPay > 0) {
  console.log(`Accumulated vacation pay from Android app: ${settings.accumulatedVacationPay.toFixed(2)} kr`);
  console.log('(This value is informational - the web app calculates vacation pay from time entries)');
}

console.log('Import completed!');
sqlite.close();
