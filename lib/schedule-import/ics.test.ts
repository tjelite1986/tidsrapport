import { describe, expect, it } from 'vitest';
import { IcsParseError, parseIcsSchedule, shiftMonthSpan } from './ics';

// Shaped like the ipool feed: UTC times, escaped commas, absence markers in
// parentheses, and floating all-day-ish vacation events
const FEED = [
  'BEGIN:VCALENDAR',
  'PRODID:-//github.com/ical-org/ical.net//NONSGML ical.net 5.0.0//EN',
  'VERSION:2.0',
  'X-WR-CALNAME:ipool',
  'BEGIN:VEVENT',
  'DTEND:20261012T180000Z',
  'DTSTART:20261012T131500Z',
  'SUMMARY:(Sjuk)',
  'UID:a',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTEND:20261022T090000Z',
  'DTSTART:20261022T050000Z',
  'SUMMARY:Store - Plock',
  'UID:b',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTEND:20261027T091500Z',
  'DTSTART:20261027T050000Z',
  'SUMMARY:Store - Kundservice\\, Kassa',
  'UID:c',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTEND:20261222T104500Z',
  'DTSTART:20261222T063000Z',
  'SUMMARY:(Semester)',
  'UID:d',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTEND:20261223T000000',
  'DTSTART:20261223T000000',
  'SUMMARY:(Semester)',
  'UID:e',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('parseIcsSchedule', () => {
  it('converts UTC to Swedish time on both sides of the DST change', () => {
    const { shifts } = parseIcsSchedule(FEED);
    // 22 Oct is summer time (UTC+2), 27 Oct winter time (UTC+1)
    expect(shifts).toEqual([
      { date: '2026-10-22', startTime: '07:00', endTime: '11:00', summary: 'Store - Plock', departments: ['Plock'], uid: 'b' },
      {
        date: '2026-10-27', startTime: '06:00', endTime: '10:15',
        summary: 'Store - Kundservice, Kassa', departments: ['Kundservice', 'Kassa'], uid: 'c',
      },
    ]);
  });

  it('counts absence markers instead of importing them', () => {
    const { skipped, calendarName } = parseIcsSchedule(FEED);
    expect(skipped).toEqual({ '(Sjuk)': 1, '(Semester)': 2 });
    expect(calendarName).toBe('ipool');
  });

  it('dates a UTC shift by its Swedish start, not its UTC day', () => {
    const feed = FEED.replace('DTSTART:20261022T050000Z', 'DTSTART:20261021T230000Z')
      .replace('DTEND:20261022T090000Z', 'DTEND:20261022T060000Z');
    const shift = parseIcsSchedule(feed).shifts[0];
    expect(shift).toMatchObject({ date: '2026-10-22', startTime: '01:00', endTime: '08:00' });
  });

  it('unfolds continuation lines and skips cancelled and all-day events', () => {
    const feed = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART;TZID=Europe/Stockholm:20261105T080000',
      'DTEND;TZID=Europe/Stockholm:20261105T163000',
      'SUMMARY:A long',
      '  summary',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261106',
      'DTEND;VALUE=DATE:20261107',
      'SUMMARY:Holiday',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'STATUS:CANCELLED',
      'DTSTART:20261107T080000Z',
      'DTEND:20261107T120000Z',
      'SUMMARY:Gone',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');
    const result = parseIcsSchedule(feed);
    expect(result.shifts).toEqual([
      { date: '2026-11-05', startTime: '08:00', endTime: '16:30', summary: 'A long summary', departments: [], uid: null },
    ]);
    expect(result.skipped).toEqual({ Heldag: 1, 'Inställda': 1 });
  });

  it('rejects something that is not a calendar', () => {
    expect(() => parseIcsSchedule('<html>login</html>')).toThrow(IcsParseError);
  });

  it('reports the month span of the shifts', () => {
    expect(shiftMonthSpan(parseIcsSchedule(FEED).shifts)).toEqual({ from: '2026-10', to: '2026-10' });
    expect(shiftMonthSpan([])).toBeNull();
  });
});
