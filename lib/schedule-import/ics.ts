/**
 * Turn an iCalendar (.ics) schedule feed into dated shifts.
 *
 * Staffing systems such as ipool publish the schedule as a subscribable ICS
 * link. Each VEVENT is one shift, usually in UTC (`DTSTART:20261014T140000Z`),
 * so the times are converted to Swedish wall-clock time here. Absence markers
 * like "(Sjuk)" and "(Semester)" are events too; they are not shifts and are
 * counted as skipped instead of imported.
 */

const TIME_ZONE = 'Europe/Stockholm';

export type IcsShift = {
  date: string;
  startTime: string;
  endTime: string;
  /** The event's SUMMARY, e.g. "Biltema Trollhättan - Kundservice, Kassa". */
  summary: string;
};

export type IcsParseResult = {
  shifts: IcsShift[];
  /** Events that are not shifts, by label: { "(Sjuk)": 2, "(Semester)": 3 }. */
  skipped: Record<string, number>;
  calendarName: string | null;
};

export class IcsParseError extends Error {}

type Property = { name: string; params: Record<string, string>; value: string };

/** RFC 5545 line unfolding: a line starting with a space or tab continues the previous one. */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function parseLine(line: string): Property | null {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const [name, ...paramParts] = line.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

const stockholmFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** A UTC instant as Swedish local date and time. */
function toStockholm(utc: Date): { date: string; time: string } {
  const parts = Object.fromEntries(stockholmFormat.formatToParts(utc).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/**
 * A DTSTART/DTEND value as local date and time, or null for an all-day value.
 * UTC values (trailing Z) are converted; floating values and values with a
 * TZID are taken as wall-clock time — every feed this has met is Swedish.
 */
function localDateTime(prop: Property): { date: string; time: string } | null {
  if (prop.params.VALUE === 'DATE') return null;
  const m = prop.value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) return toStockholm(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)));
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

/** Labels in parentheses — "(Sjuk)", "(Semester)" — mark absence, not a shift. */
function isAbsenceMarker(summary: string): boolean {
  return /^\(.*\)$/.test(summary.trim());
}

export function parseIcsSchedule(text: string): IcsParseResult {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new IcsParseError('Not an iCalendar file');

  const shifts: IcsShift[] = [];
  const skipped: Record<string, number> = {};
  let calendarName: string | null = null;
  let event: Property[] | null = null;

  const skip = (label: string) => { skipped[label] = (skipped[label] ?? 0) + 1; };

  for (const raw of unfold(text)) {
    const line = raw.trimEnd();
    if (!line) continue;
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') { event = []; continue; }
    if (upper === 'END:VEVENT') {
      if (event) handleEvent(event);
      event = null;
      continue;
    }
    const prop = parseLine(line);
    if (!prop) continue;
    if (event) event.push(prop);
    else if (prop.name === 'X-WR-CALNAME') calendarName = unescapeText(prop.value).trim() || null;
  }

  function handleEvent(props: Property[]) {
    const get = (name: string) => props.find((p) => p.name === name);
    const status = get('STATUS')?.value.toUpperCase();
    if (status === 'CANCELLED') { skip('Inställda'); return; }

    const summary = unescapeText(get('SUMMARY')?.value ?? '').trim();
    if (isAbsenceMarker(summary)) { skip(summary); return; }

    const startProp = get('DTSTART');
    const endProp = get('DTEND');
    const start = startProp ? localDateTime(startProp) : null;
    const end = endProp ? localDateTime(endProp) : null;
    if (!start || !end) { skip('Heldag'); return; }
    if (start.date === end.date && start.time === end.time) { skip('Utan längd'); return; }

    // A shift past midnight belongs to the day it starts on; the time-entry
    // API treats an end before the start as the next day
    shifts.push({ date: start.date, startTime: start.time, endTime: end.time, summary });
  }

  shifts.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  return { shifts, skipped, calendarName };
}

/** "2026-10" for the earliest and latest shift — the span the feed covers. */
export function shiftMonthSpan(shifts: IcsShift[]): { from: string; to: string } | null {
  if (shifts.length === 0) return null;
  return { from: shifts[0].date.slice(0, 7), to: shifts[shifts.length - 1].date.slice(0, 7) };
}
