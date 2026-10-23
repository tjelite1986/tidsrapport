'use client';

import { useMemo } from 'react';
import { getWeekNumber, getWeekType } from '@/lib/calculations/time-utils';
import { getHolidays } from '@/lib/calculations/holidays';

interface CalendarEntry {
  id: number;
  date: string;
  hours: number;
  startTime: string | null;
  endTime: string | null;
  entryType: string;
  projectName: string;
  pay?: { grossPay: number };
}

interface ScheduleEntry {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

interface VacationDay {
  date: string;
  dailyPay: number;
  note: string | null;
}

interface CalendarEvent {
  id: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  note: string | null;
  recurrence?: string;
}

interface Props {
  weekOffset: number;
  entries: CalendarEntry[];
  vacationDays?: VacationDay[];
  events?: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onDayClick: (date: string, entries: CalendarEntry[]) => void;
  onEntryClick: (entry: CalendarEntry) => void;
  onPrev: () => void;
  onNext: () => void;
  scheduleA?: ScheduleEntry[];
  scheduleB?: ScheduleEntry[];
  scheduleC?: ScheduleEntry[];
  scheduleD?: ScheduleEntry[];
  referenceDate?: string | null;
  weekCount?: 2 | 4;
  /** A day to point out, e.g. the one a notice links to */
  highlightDate?: string | null;
}

const dayNames = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

function getWeekDates(offset: number): string[] {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return dates;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount);
}

export default function CalendarWeekView({
  weekOffset, entries, vacationDays = [], events = [], onEventClick, onDayClick, onEntryClick, onPrev, onNext,
  scheduleA, scheduleB, scheduleC, scheduleD, referenceDate, weekCount, highlightDate,
}: Props) {
  const dates = getWeekDates(weekOffset);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const weekNum = getWeekNumber(new Date(dates[0] + 'T12:00:00'));

  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    const years = new Set<number>();
    for (const d of dates) years.add(parseInt(d.slice(0, 4)));
    for (const y of years) {
      for (const h of getHolidays(y)) {
        if (!h.halfDay) map.set(h.date, h.name);
      }
    }
    return map;
  }, [dates]);

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  const totalPay = entries.reduce((sum, e) => sum + (e.pay?.grossPay ?? 0), 0);

  function getScheduledEntry(date: string, dayIndex: number): ScheduleEntry | null {
    if (!scheduleA || !referenceDate || date < referenceDate) return null;
    const allSchedules: Record<string, ScheduleEntry[]> = {
      A: scheduleA,
      B: scheduleB ?? [],
      C: scheduleC ?? [],
      D: scheduleD ?? [],
    };
    const wt = getWeekType(date, referenceDate, weekCount ?? 2);
    const sch = allSchedules[wt] ?? [];
    return sch.find((s) => s.dayOfWeek === dayIndex && s.startTime) ?? null;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrev} className="text-blue-600 hover:underline text-sm">&larr; Föregående</button>
        <div className="text-center">
          <span className="text-lg font-semibold">Vecka {weekNum}</span>
          <span className="hidden sm:inline text-sm text-gray-500 ml-3">{dates[0]} — {dates[6]}</span>
        </div>
        <button onClick={onNext} className="text-blue-600 hover:underline text-sm">Nästa &rarr;</button>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {dates.map((d, i) => {
          const dayEntries = entries.filter((e) => e.date === d);
          const dayTotal = dayEntries.reduce((sum, e) => sum + e.hours, 0);
          const dayPay = dayEntries.reduce((sum, e) => sum + (e.pay?.grossPay ?? 0), 0);
          const isToday = d === today;
          const holidayName = holidayMap.get(d) ?? null;
          const isHoliday = holidayName !== null;
          const isSunday = i === 6 || isHoliday;
          const isSaturday = i === 5 && !isHoliday;
          const hasSick = dayEntries.some((e) => e.entryType === 'sick');
          const hasVab = dayEntries.some((e) => e.entryType === 'vab');
          const schedEntry = getScheduledEntry(d, i);
          const vacDay = vacationDays.find((v) => v.date === d);
          const dayEvents = events.filter((ev) => ev.date === d);

          return (
            <div
              key={d}
              id={`cal-day-${d}`}
              onClick={() => onDayClick(d, dayEntries)}
              className={`p-1 sm:p-2 rounded-lg border cursor-pointer transition-all min-h-[100px] min-w-0 overflow-hidden ${
                isToday ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200' :
                hasSick ? 'bg-red-100 border-red-300' :
                hasVab ? 'bg-orange-100 border-orange-300' :
                isSunday ? 'bg-pink-50 border-pink-200' :
                isSaturday ? 'bg-purple-50 border-purple-200' :
                dayTotal > 0 ? 'bg-blue-50 border-blue-200' :
                'bg-gray-50 border-gray-200'
              } hover:shadow-md${d === highlightDate ? ' ring-2 !ring-amber-400' : ''}`}
            >
              {/* Weekday above the date: side by side they collide in a ~45px phone column */}
              <div className="flex flex-col items-center sm:flex-row sm:justify-between sm:items-start">
                <span className="text-[10px] sm:text-xs text-gray-500 font-medium leading-tight">{dayNames[i]}</span>
                <span className={`text-sm font-semibold ${
                  isToday ? 'bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs' :
                  ''
                }`}>{parseInt(d.slice(8))}</span>
              </div>
              {holidayName && (
                <div className="text-[10px] text-pink-600 font-medium leading-tight break-words" title={holidayName}>
                  {holidayName}
                </div>
              )}
              {dayTotal > 0 && (
                <div className="mt-1 text-center sm:text-left">
                  <div className={`text-xs sm:text-lg font-bold ${
                    isToday ? 'text-indigo-600' :
                    isSunday ? 'text-pink-600' :
                    isSaturday ? 'text-purple-600' :
                    'text-blue-600'
                  }`}>
                    {/* "8.00h" does not fit a ~45px phone column; drop the trailing zeros there */}
                    <span className="sm:hidden">{Number(dayTotal.toFixed(2))}h</span>
                    <span className="hidden sm:inline">{dayTotal.toFixed(2)}h</span>
                  </div>
                  {dayPay > 0 && (
                    <div className="hidden sm:block text-xs text-gray-500">{formatCurrency(dayPay)}</div>
                  )}
                </div>
              )}
              {dayEntries.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {dayEntries.slice(0, 2).map((entry) => (
                    <div
                      key={entry.id}
                      onClick={(e) => { e.stopPropagation(); onEntryClick(entry); }}
                      className="text-[10px] leading-tight text-center sm:text-left sm:truncate px-0.5 sm:px-1 py-0.5 rounded bg-white/60 hover:bg-white cursor-pointer"
                    >
                      {entry.startTime && entry.endTime ? (
                        <>
                          {/* Start over end on phones; one line from sm */}
                          <span className="block sm:inline">{entry.startTime}</span>
                          <span className="hidden sm:inline">-</span>
                          <span className="block sm:inline">{entry.endTime}</span>
                        </>
                      ) : `${entry.hours.toFixed(2)}h`}
                    </div>
                  ))}
                  {dayEntries.length > 2 && (
                    <div className="text-[10px] text-gray-400">+{dayEntries.length - 2} till</div>
                  )}
                </div>
              )}
              {vacDay && (
                <div className="mt-1 bg-teal-100 border border-teal-300 rounded px-1.5 py-1">
                  <div className="text-[9px] text-teal-700 font-semibold">Semester</div>
                  {vacDay.dailyPay > 0 && (
                    <div className="text-[10px] text-teal-600 font-medium">{Math.round(vacDay.dailyPay).toLocaleString('sv-SE')} kr</div>
                  )}
                </div>
              )}
              {dayEvents.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {dayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      onClick={(e) => { e.stopPropagation(); onEventClick?.(ev); }}
                      title={ev.title}
                      className="text-[10px] leading-tight px-1 py-0.5 rounded bg-sky-100 border border-sky-300 text-sky-800 hover:bg-sky-200 cursor-pointer"
                    >
                      {ev.startTime && <div className="font-medium">{ev.startTime}<span className="hidden sm:inline">{ev.endTime ? `–${ev.endTime}` : ''}</span></div>}
                      <div className="truncate">{ev.recurrence && ev.recurrence !== 'none' ? '↻ ' : ''}{ev.title}</div>
                    </div>
                  ))}
                </div>
              )}
              {dayTotal === 0 && schedEntry && (
                <div className="mt-1 border border-dashed border-gray-300 rounded px-0.5 sm:px-1.5 py-1 bg-white/50">
                  <div className="text-[9px] text-gray-400">Schema</div>
                  <div className="text-[10px] sm:text-[11px] leading-tight text-gray-600 font-medium">
                    <span className="block sm:inline">{schedEntry.startTime}</span>
                    <span className="hidden sm:inline">–</span>
                    <span className="block sm:inline">{schedEntry.endTime}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
        <span>Totalt: <strong className="text-blue-600">{totalHours.toFixed(2)}h</strong></span>
        {totalPay > 0 && <span>Brutto: <strong className="text-green-600">{formatCurrency(totalPay)}</strong></span>}
      </div>
    </div>
  );
}
