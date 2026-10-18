import { describe, expect, it } from 'vitest';
import { isoWeekMonday, normalizeTime, parseMonthText, resolveSchedule, type ScheduleRow } from './resolve';

const cell = (column: number, day: number, times?: [string, string], greyed = false) => ({
  column,
  day,
  greyed,
  startTime: times?.[0] ?? '',
  endTime: times?.[1] ?? '',
});

/** Week row: seven consecutive day numbers starting on Monday, with shifts by column. */
function week(weekNumber: number | null, mondayDay: number, daysInPrevMonth: number | null, shifts: Record<number, [string, string]>, greyedColumns: number[] = []): ScheduleRow {
  const cells = [];
  for (let column = 0; column < 7; column++) {
    let day = mondayDay + column;
    if (daysInPrevMonth !== null && day > daysInPrevMonth) day -= daysInPrevMonth;
    cells.push(cell(column, day, shifts[column], greyedColumns.includes(column)));
  }
  return { weekNumber, cells };
}

const today = new Date(2026, 9, 18); // 2026-10-18

describe('isoWeekMonday', () => {
  it('finds the Monday of a week', () => {
    expect(isoWeekMonday(2026, 10).getDate()).toBe(2); // 2026-03-02
    expect(isoWeekMonday(2026, 10).getMonth()).toBe(2);
    expect(isoWeekMonday(2026, 1).getDate()).toBe(29); // 2025-12-29
    expect(isoWeekMonday(2026, 1).getFullYear()).toBe(2025);
  });
});

describe('resolveSchedule', () => {
  // The March 2026 screenshot: week 9 is February and greyed, week 14 runs into April.
  const march: ScheduleRow[] = [
    week(9, 23, 28, { 0: ['07:00', '12:00'], 2: ['07:00', '12:00'], 3: ['07:00', '12:00'], 4: ['07:00', '17:00'] }, [0, 1, 2, 3, 4, 5]),
    week(10, 2, null, { 0: ['15:15', '20:15'], 1: ['06:00', '14:00'], 2: ['15:00', '20:00'], 3: ['15:00', '20:00'], 5: ['09:00', '15:00'], 6: ['11:30', '18:15'] }),
    week(11, 9, null, { 0: ['07:00', '12:00'], 2: ['07:00', '12:00'], 3: ['07:00', '11:00'], 4: ['12:00', '17:00'] }),
    week(12, 16, null, { 1: ['07:00', '14:00'], 3: ['14:00', '20:00'], 4: ['07:00', '20:00'], 5: ['09:00', '17:00'], 6: ['09:00', '17:00'] }),
    week(13, 23, null, { 0: ['07:00', '12:00'], 2: ['07:00', '12:00'], 3: ['07:00', '12:00'], 4: ['07:00', '12:00'] }),
    week(14, 30, 31, {}, [2, 3, 4, 5, 6]),
  ];

  it('dates a cropped calendar from its week numbers', () => {
    const result = resolveSchedule(march, { today });
    expect(result.month).toBe('2026-03');
    expect(result.shifts).toHaveLength(19);
    expect(result.shifts[0]).toEqual({ date: '2026-03-02', startTime: '15:15', endTime: '20:15' });
    expect(result.shifts.at(-1)).toEqual({ date: '2026-03-27', startTime: '07:00', endTime: '12:00' });
    expect(result.outsideMonth).toBe(4); // the February shifts in week 9
    expect(result.matchedCells).toBe(result.totalCells);
  });

  it('dates the January screenshot where week 1 is missing and week 5 crosses into February', () => {
    const january: ScheduleRow[] = [
      week(2, 5, null, { 0: ['14:00', '20:00'], 1: ['09:00', '16:00'], 2: ['15:00', '20:00'], 3: ['15:00', '20:00'], 5: ['06:15', '15:15'], 6: ['11:30', '18:15'] }),
      week(3, 12, null, { 0: ['07:00', '12:00'], 2: ['07:00', '16:00'], 3: ['07:00', '16:00'], 4: ['12:00', '17:00'] }),
      week(4, 19, null, { 0: ['09:15', '14:00'], 1: ['06:00', '14:00'], 3: ['14:00', '20:00'], 4: ['07:00', '14:00'], 5: ['09:00', '17:00'], 6: ['09:00', '17:00'] }),
      week(5, 26, 31, { 0: ['07:00', '12:00'], 2: ['07:00', '12:00'], 3: ['07:00', '12:00'], 4: ['07:00', '12:00'] }, [6]),
    ];
    const result = resolveSchedule(january, { today });
    expect(result.month).toBe('2026-01');
    expect(result.shifts).toHaveLength(20);
    expect(result.shifts[0].date).toBe('2026-01-05');
    expect(result.shifts.at(-1)?.date).toBe('2026-01-30');
  });

  it('fills in rows whose week number was cropped away', () => {
    const rows = march.map((row, index) => (index === 2 ? { ...row, weekNumber: null } : row));
    expect(resolveSchedule(rows, { today }).shifts).toHaveLength(19);
  });

  it('falls back on the day pattern when no week numbers are visible', () => {
    const rows = march.map((row) => ({ ...row, weekNumber: null }));
    // Day 2 is a Monday in March 2026 and in November 2026; next month from
    // mid-February is March.
    const result = resolveSchedule(rows, { today: new Date(2026, 1, 15) });
    expect(result.month).toBe('2026-03');
    expect(result.shifts).toHaveLength(19);
  });

  it('lets a visible month heading break a tie', () => {
    // Weeks 10-13 alone (days 2-29 from a Monday) fit March and November 2026 equally.
    const rows = march.slice(1, 5).map((row) => ({ ...row, weekNumber: null }));
    expect(resolveSchedule(rows, { today: new Date(2026, 1, 15) }).month).toBe('2026-03');
    const result = resolveSchedule(rows, { today: new Date(2026, 1, 15), hintMonth: '2026-11' });
    expect(result.month).toBe('2026-11');
  });

  it('refuses a grid whose numbers fit no month', () => {
    const rows: ScheduleRow[] = [{ weekNumber: 10, cells: [cell(0, 17), cell(1, 3), cell(2, 25)] }];
    expect(() => resolveSchedule(rows, { today })).toThrow(/line up/);
  });

  it('drops cells with unreadable or empty times', () => {
    const rows: ScheduleRow[] = [
      { weekNumber: 10, cells: [cell(0, 2, ['7:00', '12.00']), cell(1, 3, ['x', '12:00']), cell(2, 4, ['09:00', '09:00'])] },
    ];
    const result = resolveSchedule(rows, { today });
    expect(result.shifts).toEqual([{ date: '2026-03-02', startTime: '07:00', endTime: '12:00' }]);
  });
});

describe('normalizeTime', () => {
  it('pads and accepts a dot separator', () => {
    expect(normalizeTime('7:00')).toBe('07:00');
    expect(normalizeTime('18.15')).toBe('18:15');
    expect(normalizeTime('24:00')).toBeNull();
    expect(normalizeTime('')).toBeNull();
  });
});

describe('parseMonthText', () => {
  it('reads Swedish and English headings', () => {
    expect(parseMonthText('Mars 2026')).toBe('2026-03');
    expect(parseMonthText('okt. 2026')).toBe('2026-10');
    expect(parseMonthText('2026-11')).toBe('2026-11');
    expect(parseMonthText('vecka 10')).toBeNull();
    expect(parseMonthText('')).toBeNull();
  });
});
