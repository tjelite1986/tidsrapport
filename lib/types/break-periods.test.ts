import { describe, it, expect } from 'vitest';
import { sumBreakMinutes, parseBreakPeriods } from './break-periods';

describe('sumBreakMinutes', () => {
  it('sums plain daytime breaks', () => {
    expect(sumBreakMinutes([{ start: '12:00', end: '12:30' }])).toBe(30);
    expect(sumBreakMinutes([
      { start: '09:15', end: '09:30' },
      { start: '12:00', end: '13:00' },
    ])).toBe(75);
  });

  it('handles breaks spanning midnight', () => {
    expect(sumBreakMinutes([{ start: '23:45', end: '00:15' }])).toBe(30);
  });

  it('ignores empty and malformed periods', () => {
    expect(sumBreakMinutes([{ start: '', end: '12:30' }])).toBe(0);
    expect(sumBreakMinutes([{ start: 'abc', end: 'def' }])).toBe(0);
  });
});

describe('parseBreakPeriods', () => {
  it('parses valid JSON and rejects garbage', () => {
    expect(parseBreakPeriods('[{"start":"12:00","end":"12:30"}]')).toEqual([
      { start: '12:00', end: '12:30' },
    ]);
    expect(parseBreakPeriods('not json')).toEqual([]);
    expect(parseBreakPeriods(null)).toEqual([]);
  });
});
