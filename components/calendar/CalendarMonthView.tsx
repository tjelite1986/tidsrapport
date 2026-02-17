'use client';

import { getWeekNumber } from '@/lib/calculations/time-utils';

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

interface Props {
  year: number;
  month: number; // 0-indexed
  entries: CalendarEntry[];
  onDayClick: (date: string, entries: CalendarEntry[]) => void;
  onEntryClick: (entry: CalendarEntry) => void;
  onPrev: () => void;
  onNext: () => void;
}

const dayHeaders = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const monthNames = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount);
}

export default function CalendarMonthView({ year, month, entries, onDayClick, onEntryClick, onPrev, onNext }: Props) {
  const today = new Date().toISOString().split('T')[0];

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // 0=Mon

  const weeks: (string | null)[][] = [];
  let currentWeek: (string | null)[] = new Array(startDow).fill(null);

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    currentWeek.push(dateStr);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  const totalPay = entries.reduce((sum, e) => sum + (e.pay?.grossPay ?? 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrev} className="text-blue-600 hover:underline text-sm">&larr; Föregående</button>
        <span className="text-lg font-semibold">{monthNames[month]} {year}</span>
        <button onClick={onNext} className="text-blue-600 hover:underline text-sm">Nästa &rarr;</button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-8 bg-gray-100 border-b">
          <div className="p-2 text-xs font-medium text-gray-500 text-center">V</div>
          {dayHeaders.map((d) => (
            <div key={d} className="p-2 text-xs font-medium text-gray-500 text-center">{d}</div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => {
          const firstDateInWeek = week.find((d) => d !== null);
          const weekNum = firstDateInWeek ? getWeekNumber(new Date(firstDateInWeek + 'T12:00:00')) : '';

          return (
            <div key={wi} className="grid grid-cols-8 border-b last:border-b-0">
              <div className="p-1 text-xs text-gray-400 text-center flex items-start justify-center pt-2">{weekNum}</div>
              {week.map((dateStr, di) => {
                if (!dateStr) return <div key={di} className="p-1 bg-gray-50 min-h-[60px]" />;

                const dayEntries = entries.filter((e) => e.date === dateStr);
                const dayTotal = dayEntries.reduce((sum, e) => sum + e.hours, 0);
                const isToday = dateStr === today;
                const isSunday = di === 6;
                const isSaturday = di === 5;
                const dayNum = parseInt(dateStr.slice(8));

                return (
                  <div
                    key={di}
                    onClick={() => onDayClick(dateStr, dayEntries)}
                    className={`p-1 min-h-[60px] cursor-pointer border-l transition-colors ${
                      isToday ? 'bg-indigo-50' :
                      isSunday ? 'bg-pink-50/50' :
                      isSaturday ? 'bg-purple-50/50' :
                      'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`text-xs font-medium mb-0.5 ${
                      isToday ? 'bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center' :
                      isSunday ? 'text-pink-600' :
                      isSaturday ? 'text-purple-600' :
                      'text-gray-700'
                    }`}>{dayNum}</div>
                    {dayTotal > 0 && (
                      <div className={`text-xs font-bold ${
                        isToday ? 'text-indigo-600' :
                        isSunday ? 'text-pink-600' :
                        isSaturday ? 'text-purple-600' :
                        'text-blue-600'
                      }`}>{dayTotal.toFixed(1)}h</div>
                    )}
                    {dayEntries.slice(0, 1).map((entry) => (
                      <div
                        key={entry.id}
                        onClick={(e) => { e.stopPropagation(); onEntryClick(entry); }}
                        className="text-[9px] truncate text-gray-500 hover:text-gray-800 cursor-pointer"
                      >
                        {entry.startTime ? `${entry.startTime}` : entry.projectName}
                      </div>
                    ))}
                    {dayEntries.length > 1 && (
                      <div className="text-[9px] text-gray-400">+{dayEntries.length - 1}</div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-3 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
        <span>Totalt: <strong className="text-blue-600">{totalHours.toFixed(1)}h</strong></span>
        <span>{entries.length} registreringar</span>
        {totalPay > 0 && <span>Brutto: <strong className="text-green-600">{formatCurrency(totalPay)}</strong></span>}
      </div>
    </div>
  );
}
