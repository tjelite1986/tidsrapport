/**
 * Turn the grid the AI reads off a schedule screenshot into dated shifts.
 *
 * The screenshot rarely shows the month name — it is a crop of a calendar
 * with ISO week numbers down the left edge and day numbers in the cells. Week
 * number + column (Mon..Sun) + day number pins the date down exactly, so the
 * month is derived here instead of asked of the user or guessed by the model.
 */

export type ScheduleCell = {
  /** Column position: 0 = Monday … 6 = Sunday. */
  column: number;
  /** Day-of-month number printed in the cell. */
  day: number;
  /** Rendered as belonging to a neighbouring month (greyed out). */
  greyed: boolean;
  startTime: string;
  endTime: string;
};

export type ScheduleRow = {
  /** ISO week number printed on the row, or null when not visible. */
  weekNumber: number | null;
  cells: ScheduleCell[];
};

export type ResolvedShift = {
  date: string;
  startTime: string;
  endTime: string;
};

export type ResolvedSchedule = {
  /** The month the screenshot is about, YYYY-MM. */
  month: string;
  shifts: ResolvedShift[];
  /** Shifts that fell on neighbouring-month days and were left out. */
  outsideMonth: number;
  matchedCells: number;
  totalCells: number;
};

export class ScheduleResolveError extends Error {}

const TIME_RE = /^(\d{1,2})[:.](\d{2})$/;

/** "7:00" and "07.00" both become "07:00"; anything else is not a time. */
export function normalizeTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = TIME_RE.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Local date components only — toISOString() would shift the day near midnight. */
function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthKey(date: Date): string {
  return formatDate(date).slice(0, 7);
}

/** Monday of ISO week `week` in ISO year `isoYear`. January 4 is always in week 1. */
export function isoWeekMonday(isoYear: number, week: number): Date {
  const jan4 = new Date(isoYear, 0, 4);
  const offsetToMonday = (jan4.getDay() + 6) % 7;
  const firstMonday = addDays(jan4, -offsetToMonday);
  return addDays(firstMonday, (week - 1) * 7);
}

type Candidate = {
  /** Monday date per row index. */
  mondays: Date[];
};

function scoreCandidate(rows: ScheduleRow[], candidate: Candidate): number {
  let score = 0;
  rows.forEach((row, index) => {
    const monday = candidate.mondays[index];
    for (const cell of row.cells) {
      if (addDays(monday, cell.column).getDate() === cell.day) score++;
    }
  });
  return score;
}

/** Row Mondays when at least one row carries a week number: rows without one
 *  are placed relative to the nearest row that has one. */
function mondaysFromWeeks(rows: ScheduleRow[], isoYear: number): Date[] | null {
  const anchorIndex = rows.findIndex((r) => r.weekNumber !== null);
  if (anchorIndex < 0) return null;
  const anchor = isoWeekMonday(isoYear, rows[anchorIndex].weekNumber as number);
  return rows.map((row, index) => {
    if (row.weekNumber !== null) {
      // A week number that disagrees with the anchor row's position (e.g. the
      // model misread a "1" as "7") still gets the date its own number says —
      // the score decides which reading survives.
      return isoWeekMonday(isoYear, row.weekNumber);
    }
    return addDays(anchor, (index - anchorIndex) * 7);
  });
}

/** Row Mondays when no week number is visible: anchor the first cell of the
 *  first row on a day of the candidate month. */
function mondaysFromMonth(rows: ScheduleRow[], year: number, month: number): Date[] | null {
  const first = rows[0]?.cells[0];
  if (!first) return null;
  const monday0 = new Date(year, month - 1, first.day - first.column);
  return rows.map((_, index) => addDays(monday0, index * 7));
}

function monthDistance(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return Math.abs(ay * 12 + am - (by * 12 + bm));
}

function mainMonth(rows: ScheduleRow[], mondays: Date[]): string | null {
  const counts = new Map<string, number>();
  const bump = (key: string, weight: number) => counts.set(key, (counts.get(key) ?? 0) + weight);
  rows.forEach((row, index) => {
    for (const cell of row.cells) {
      const date = addDays(mondays[index], cell.column);
      if (date.getDate() !== cell.day) continue;
      // A greyed cell is evidence for the neighbouring month, but weakly: the
      // model is not always sure what is greyed.
      bump(monthKey(date), cell.greyed ? 0.1 : 1);
    }
  });
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

export type ResolveOptions = {
  today?: Date;
  /** YYYY-MM read from a month heading in the image, when one was visible. */
  hintMonth?: string | null;
};

/**
 * Pick the month the grid belongs to and date every shift.
 *
 * Candidates are scored on how many cells land on the day number they show.
 * With week numbers the candidate is an ISO year; without, it is a month in a
 * window around today. Ties go to the hint month, then to the month nearest
 * next month — schedules are published ahead of time.
 */
export function resolveSchedule(rows: ScheduleRow[], options: ResolveOptions = {}): ResolvedSchedule {
  const today = options.today ?? new Date();
  const hintMonth = options.hintMonth ?? null;
  const cleanRows: ScheduleRow[] = rows
    .map((row) => ({
      weekNumber: row.weekNumber !== null && row.weekNumber >= 1 && row.weekNumber <= 53 ? row.weekNumber : null,
      cells: row.cells.filter((c) => c.column >= 0 && c.column <= 6 && c.day >= 1 && c.day <= 31),
    }))
    .filter((row) => row.cells.length > 0);

  const totalCells = cleanRows.reduce((sum, row) => sum + row.cells.length, 0);
  if (totalCells === 0) throw new ScheduleResolveError('No calendar cells were found in the image');

  const nextMonth = monthKey(new Date(today.getFullYear(), today.getMonth() + 1, 1));
  const hasWeeks = cleanRows.some((r) => r.weekNumber !== null);

  const candidates: Candidate[] = [];
  if (hasWeeks) {
    for (let isoYear = today.getFullYear() - 1; isoYear <= today.getFullYear() + 1; isoYear++) {
      const mondays = mondaysFromWeeks(cleanRows, isoYear);
      if (mondays) candidates.push({ mondays });
    }
  } else {
    for (let offset = -8; offset <= 10; offset++) {
      const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      const mondays = mondaysFromMonth(cleanRows, d.getFullYear(), d.getMonth() + 1);
      if (mondays) candidates.push({ mondays });
    }
  }

  let best: { candidate: Candidate; score: number; month: string } | null = null;
  for (const candidate of candidates) {
    const score = scoreCandidate(cleanRows, candidate);
    if (score === 0) continue;
    const month = mainMonth(cleanRows, candidate.mondays);
    if (!month) continue;
    if (!best || score > best.score) {
      best = { candidate, score, month };
      continue;
    }
    if (score === best.score) {
      const hintWins = hintMonth !== null && month === hintMonth && best.month !== hintMonth;
      const closer = monthDistance(month, nextMonth) < monthDistance(best.month, nextMonth);
      if (hintWins || (!(hintMonth !== null && best.month === hintMonth) && closer)) {
        best = { candidate, score, month };
      }
    }
  }

  if (!best || best.score < Math.max(1, Math.ceil(totalCells / 2))) {
    throw new ScheduleResolveError('The day numbers in the image do not line up with any month');
  }

  const shifts: ResolvedShift[] = [];
  let outsideMonth = 0;
  cleanRows.forEach((row, index) => {
    for (const cell of row.cells) {
      const date = addDays(best!.candidate.mondays[index], cell.column);
      if (date.getDate() !== cell.day) continue;
      const startTime = normalizeTime(cell.startTime);
      const endTime = normalizeTime(cell.endTime);
      if (!startTime || !endTime || startTime === endTime) continue;
      if (monthKey(date) !== best!.month) {
        outsideMonth++;
        continue;
      }
      shifts.push({ date: formatDate(date), startTime, endTime });
    }
  });
  shifts.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  return { month: best.month, shifts, outsideMonth, matchedCells: best.score, totalCells };
}

const MONTH_NAMES: Record<string, number> = {
  januari: 1, january: 1, jan: 1,
  februari: 2, february: 2, feb: 2,
  mars: 3, march: 3, mar: 3,
  april: 4, apr: 4,
  maj: 5, may: 5,
  juni: 6, june: 6, jun: 6,
  juli: 7, july: 7, jul: 7,
  augusti: 8, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, october: 10, okt: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

/** "mars 2026", "March 2026" or "2026-03" → "2026-03"; null when unreadable. */
export function parseMonthText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  if (!text) return null;
  const iso = /^(\d{4})-(\d{2})$/.exec(text);
  if (iso) {
    const month = Number(iso[2]);
    return month >= 1 && month <= 12 ? `${iso[1]}-${iso[2]}` : null;
  }
  const words = /^([a-zåäö]+)\.?\s+(\d{4})$/.exec(text);
  if (!words) return null;
  const month = MONTH_NAMES[words[1]];
  if (!month) return null;
  return `${words[2]}-${String(month).padStart(2, '0')}`;
}
