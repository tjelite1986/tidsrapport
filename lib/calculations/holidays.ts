export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  halfDay: boolean; // true = halvdag (julafton, nyårsafton, etc.)
}

// Computus algorithm for Easter Sunday
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// Midsommar: fredag mellan 19-25 juni
function getMidsommarEve(year: number): Date {
  for (let day = 19; day <= 25; day++) {
    const d = new Date(year, 5, day); // June
    if (d.getDay() === 5) return d; // Friday
  }
  return new Date(year, 5, 19);
}

// Alla helgons dag: lördag mellan 31 okt - 6 nov
function getAllaSaints(year: number): Date {
  for (let day = 31; day <= 37; day++) {
    const d = day <= 31
      ? new Date(year, 9, day) // Oct 31
      : new Date(year, 10, day - 31); // Nov 1-6
    if (d.getDay() === 6) return d; // Saturday
  }
  return new Date(year, 10, 1);
}

export function getHolidays(year: number): Holiday[] {
  const easter = getEasterSunday(year);
  const midsommarEve = getMidsommarEve(year);
  const midsommarDay = addDays(midsommarEve, 1);
  const allaSaints = getAllaSaints(year);

  const holidays: Holiday[] = [
    // Fixed holidays
    { date: `${year}-01-01`, name: 'Nyårsdagen', halfDay: false },
    { date: `${year}-01-06`, name: 'Trettondedag jul', halfDay: false },
    { date: `${year}-05-01`, name: 'Första maj', halfDay: false },
    { date: `${year}-06-06`, name: 'Nationaldagen', halfDay: false },
    { date: `${year}-12-25`, name: 'Juldagen', halfDay: false },
    { date: `${year}-12-26`, name: 'Annandag jul', halfDay: false },

    // Easter-based
    { date: formatDate(addDays(easter, -2)), name: 'Långfredagen', halfDay: false },
    { date: formatDate(easter), name: 'Påskdagen', halfDay: false },
    { date: formatDate(addDays(easter, 1)), name: 'Annandag påsk', halfDay: false },
    { date: formatDate(addDays(easter, 39)), name: 'Kristi himmelsfärdsdag', halfDay: false },
    { date: formatDate(addDays(easter, 49)), name: 'Pingstdagen', halfDay: false },

    // Midsommar
    { date: formatDate(midsommarDay), name: 'Midsommardagen', halfDay: false },

    // Alla helgons dag
    { date: formatDate(allaSaints), name: 'Alla helgons dag', halfDay: false },

    // Half days
    { date: formatDate(addDays(easter, -3)), name: 'Skärtorsdagen (halvdag)', halfDay: true },
    { date: formatDate(midsommarEve), name: 'Midsommarafton', halfDay: true },
    { date: `${year}-12-24`, name: 'Julafton', halfDay: true },
    { date: `${year}-12-31`, name: 'Nyårsafton', halfDay: true },
  ];

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

export function isRedDay(date: string, holidays?: Holiday[]): boolean {
  const year = parseInt(date.split('-')[0]);
  const list = holidays || getHolidays(year);
  // Check if it's a Sunday
  const d = new Date(date + 'T12:00:00');
  if (d.getDay() === 0) return true;
  return list.some((h) => h.date === date && !h.halfDay);
}

export function isHalfDay(date: string, holidays?: Holiday[]): boolean {
  const year = parseInt(date.split('-')[0]);
  const list = holidays || getHolidays(year);
  return list.some((h) => h.date === date && h.halfDay);
}

// Day before a red day (for OB purposes)
export function isDayBeforeRedDay(date: string, holidays?: Holiday[]): boolean {
  const d = new Date(date + 'T12:00:00');
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  const nextStr = next.toISOString().split('T')[0];
  return isRedDay(nextStr, holidays);
}
