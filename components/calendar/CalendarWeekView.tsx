'use client';

import { getWeekNumber, getWeekType } from '@/lib/calculations/time-utils';

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

interface Props {
  weekOffset: number;
  entries: CalendarEntry[];
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
  weekOffset, entries, onDayClick, onEntryClick, onPrev, onNext,
  scheduleA, scheduleB, scheduleC, scheduleD, referenceDate, weekCount,
}: Props) {
  const dates = getWeekDates(weekOffset);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const weekNum = getWeekNumber(new Date(dates[0] + 'T12:00:00'));

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

      <div className="grid grid-cols-7 gap-1.5">
        {dates.map((d, i) => {
          const dayEntries = entries.filter((e) => e.date === d);
          const dayTotal = dayEntries.reduce((sum, e) => sum + e.hours, 0);
          const dayPay = dayEntries.reduce((sum, e) => sum + (e.pay?.grossPay ?? 0), 0);
          const isToday = d === today;
          const isSunday = i === 6;
          const isSaturday = i === 5;
          const hasSick = dayEntries.some((e) => e.entryType === 'sick');
          const schedEntry = getScheduledEntry(d, i);

          return (
            <div
              key={d}
              onClick={() => onDayClick(d, dayEntries)}
              className={`p-2 rounded-lg border cursor-pointer transition-all min-h-[100px] ${
                isToday ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200' :
                isSunday ? 'bg-pink-50 border-pink-200' :
                isSaturday ? 'bg-purple-50 border-purple-200' :
                hasSick ? 'bg-red-50 border-red-200' :
                dayTotal > 0 ? 'bg-blue-50 border-blue-200' :
                'bg-gray-50 border-gray-200'
              } hover:shadow-md`}
            >
              <div className="flex justify-between items-start">
                <span className="text-xs text-gray-500 font-medium">{dayNames[i]}</span>
                <span className={`text-sm font-semibold ${
                  isToday ? 'bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs' :
                  ''
                }`}>{parseInt(d.slice(8))}</span>
              </div>
              {dayTotal > 0 && (
                <div className="mt-1">
                  <div className={`text-lg font-bold ${
                    isToday ? 'text-indigo-600' :
                    isSunday ? 'text-pink-600' :
                    isSaturday ? 'text-purple-600' :
                    'text-blue-600'
                  }`}>{dayTotal.toFixed(1)}h</div>
                  {dayPay > 0 && (
                    <div className="text-xs text-gray-500">{formatCurrency(dayPay)}</div>
                  )}
                </div>
              )}
              {dayEntries.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {dayEntries.slice(0, 2).map((entry) => (
                    <div
                      key={entry.id}
                      onClick={(e) => { e.stopPropagation(); onEntryClick(entry); }}
                      className="text-[10px] truncate px-1 py-0.5 rounded bg-white/60 hover:bg-white cursor-pointer"
                    >
                      {entry.startTime && entry.endTime ? `${entry.startTime}-${entry.endTime}` : `${entry.hours.toFixed(1)}h`}
                    </div>
                  ))}
                  {dayEntries.length > 2 && (
                    <div className="text-[10px] text-gray-400">+{dayEntries.length - 2} till</div>
                  )}
                </div>
              )}
              {dayTotal === 0 && schedEntry && (
                <div className="mt-1 border border-dashed border-gray-300 rounded px-1.5 py-1 bg-white/50">
                  <div className="text-[9px] text-gray-400">Schema</div>
                  <div className="text-[11px] text-gray-600 font-medium">{schedEntry.startTime}–{schedEntry.endTime}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
        <span>Totalt: <strong className="text-blue-600">{totalHours.toFixed(1)}h</strong></span>
        {totalPay > 0 && <span>Brutto: <strong className="text-green-600">{formatCurrency(totalPay)}</strong></span>}
      </div>
    </div>
  );
}
