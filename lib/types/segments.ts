export interface TaskSegment {
  department: string;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
}

export function parseTaskSegments(json: string | null | undefined): TaskSegment[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is TaskSegment =>
        typeof s === 'object' &&
        s !== null &&
        typeof s.department === 'string' &&
        typeof s.startTime === 'string' &&
        typeof s.endTime === 'string'
    );
  } catch {
    return [];
  }
}

export function serializeTaskSegments(segments: TaskSegment[]): string | null {
  if (segments.length === 0) return null;
  return JSON.stringify(segments);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function validateSegments(
  segments: TaskSegment[],
  passStart: string,
  passEnd: string
): { warnings: string[] } {
  const warnings: string[] = [];
  if (segments.length === 0) return { warnings };

  const passStartMin = timeToMinutes(passStart);
  let passEndMin = timeToMinutes(passEnd);
  if (passEndMin <= passStartMin) passEndMin += 1440; // nattskifte

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg.startTime || !seg.endTime) continue;

    const segStart = timeToMinutes(seg.startTime);
    let segEnd = timeToMinutes(seg.endTime);
    if (segEnd <= segStart) segEnd += 1440;

    if (segStart < passStartMin || segEnd > passEndMin) {
      warnings.push(`Segment "${seg.department}" (${seg.startTime}–${seg.endTime}) faller utanför passet.`);
    }

    // Kontrollera överlapp med nästa segment
    if (i + 1 < segments.length) {
      const next = segments[i + 1];
      if (!next.startTime) continue;
      const nextStart = timeToMinutes(next.startTime);
      if (segEnd > nextStart) {
        warnings.push(`Överlapp mellan "${seg.department}" och "${next.department}".`);
      }
    }
  }

  return { warnings };
}
