export interface BreakPeriod {
  start: string; // HH:MM
  end: string;   // HH:MM
}

export function parseBreakPeriods(json: string | null | undefined): BreakPeriod[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is BreakPeriod =>
        typeof p === 'object' &&
        p !== null &&
        typeof p.start === 'string' &&
        typeof p.end === 'string'
    );
  } catch {
    return [];
  }
}

export function serializeBreakPeriods(periods: BreakPeriod[]): string | null {
  const valid = periods.filter((p) => p.start && p.end);
  if (valid.length === 0) return null;
  return JSON.stringify(valid);
}

export function sumBreakMinutes(periods: BreakPeriod[]): number {
  return periods.reduce((sum, p) => {
    if (!p.start || !p.end) return sum;
    const [sh, sm] = p.start.split(':').map(Number);
    const [eh, em] = p.end.split(':').map(Number);
    return sum + Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  }, 0);
}
