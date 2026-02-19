// Returnerar 'A' eller 'B' beroende på vilken vecka date befinner sig i
// relativt referenceDate. referenceDate är den vecka som klassas som Vecka A.
export function getWeekType(date: string, referenceDate: string): 'A' | 'B' {
  // Normalisera båda till veckans måndag (ISO: måndag = dag 1)
  function toMonday(d: Date): Date {
    const day = d.getDay(); // 0=sön, 1=mån
    const diff = day === 0 ? -6 : 1 - day;
    const m = new Date(d);
    m.setDate(m.getDate() + diff);
    m.setHours(0, 0, 0, 0);
    return m;
  }
  const dateMonday = toMonday(new Date(date + 'T12:00:00'));
  const refMonday = toMonday(new Date(referenceDate + 'T12:00:00'));
  const diffMs = dateMonday.getTime() - refMonday.getTime();
  const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  // ((diffWeeks % 2) + 2) % 2 hanterar negativa tal korrekt
  return ((diffWeeks % 2) + 2) % 2 === 0 ? 'A' : 'B';
}

export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function calculateWorkHours(startTime: string, endTime: string, breakMinutes: number): number {
  let startMin = timeToMinutes(startTime);
  let endMin = timeToMinutes(endTime);
  if (endMin <= startMin) endMin += 24 * 60; // overnight shift
  const totalMinutes = endMin - startMin - breakMinutes;
  return Math.max(0, totalMinutes / 60);
}

export function calculateAutoBreak(startTime: string, endTime: string): number {
  let startMin = timeToMinutes(startTime);
  let endMin = timeToMinutes(endTime);
  if (endMin <= startMin) endMin += 24 * 60;
  const totalHours = (endMin - startMin) / 60;

  if (totalHours >= 8) return 60;
  if (totalHours >= 6) return 30;
  if (totalHours >= 4) return 15;
  return 0;
}

export interface TimeSegment {
  startMinutes: number;
  endMinutes: number;
  hours: number;
}

// Split a time range at given boundary points (in minutes from midnight)
// Handles overnight shifts by extending past 24:00
export function splitTimeRange(
  startTime: string,
  endTime: string,
  breakMinutes: number,
  boundaries: number[]
): TimeSegment[] {
  let startMin = timeToMinutes(startTime);
  let endMin = timeToMinutes(endTime);
  if (endMin <= startMin) endMin += 24 * 60;

  // Subtract break proportionally from the end
  const effectiveEnd = endMin - breakMinutes;
  if (effectiveEnd <= startMin) return [];

  // Collect all boundary points within the range
  const allBoundaries = new Set<number>();
  allBoundaries.add(startMin);
  allBoundaries.add(effectiveEnd);

  for (const b of boundaries) {
    // Add boundary and its +24h variant for overnight shifts
    if (b > startMin && b < effectiveEnd) allBoundaries.add(b);
    if (b + 1440 > startMin && b + 1440 < effectiveEnd) allBoundaries.add(b + 1440);
  }

  const sorted = Array.from(allBoundaries).sort((a, b) => a - b);
  const segments: TimeSegment[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEnd = sorted[i + 1];
    segments.push({
      startMinutes: segStart,
      endMinutes: segEnd,
      hours: (segEnd - segStart) / 60,
    });
  }

  return segments;
}
