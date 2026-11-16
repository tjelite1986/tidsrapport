import { describe, expect, it } from 'vitest';
import { buildReportCsv, csvField, entryTypeLabel } from './csv';

const base = {
  date: '2026-11-02', userName: 'Thomas', projectName: 'Arbete', startTime: '11:00', endTime: '20:15',
  breakMinutes: 45, hours: 8.5, entryType: 'work', overtimeType: 'none', description: null,
};

describe('report CSV', () => {
  it('keeps the original header and column order', () => {
    expect(buildReportCsv([base])).toBe(
      'Datum,Användare,Projekt,Start,Slut,Rast(min),Timmar,Typ,Övertid,Beskrivning\n' +
      '2026-11-02,Thomas,Arbete,11:00,20:15,45,8.5,work,-,',
    );
  });

  it('writes empty times and a zero break for full-day absence', () => {
    expect(buildReportCsv([{ ...base, startTime: null, endTime: null, breakMinutes: null, entryType: 'sick', overtimeType: 'mertid' }]).split('\n')[1])
      .toBe('2026-11-02,Thomas,Arbete,,,0,8.5,sick,Mertid,');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(csvField('Kassa, Lager')).toBe('"Kassa, Lager"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('a\nb')).toBe('"a\nb"');
    expect(csvField(null)).toBe('');
  });

  it('labels entry types', () => {
    expect([entryTypeLabel('sick'), entryTypeLabel('vab'), entryTypeLabel('work')]).toEqual(['Sjuk', 'VAB', 'Arb']);
  });
});
