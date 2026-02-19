'use client';

import { useState, useRef, useEffect } from 'react';

const DAY_NAMES = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const MONTH_NAMES = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
];

interface Props {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
}

export default function DatePicker({ value, onChange, required, className, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [navYear, setNavYear] = useState(() => value ? parseInt(value.slice(0, 4)) : new Date().getFullYear());
  const [navMonth, setNavMonth] = useState(() => value ? parseInt(value.slice(5, 7)) - 1 : new Date().getMonth());
  const ref = useRef<HTMLDivElement>(null);

  // Stäng vid klick utanför
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Stäng vid Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  function handleOpen() {
    if (value) {
      setNavYear(parseInt(value.slice(0, 4)));
      setNavMonth(parseInt(value.slice(5, 7)) - 1);
    } else {
      const now = new Date();
      setNavYear(now.getFullYear());
      setNavMonth(now.getMonth());
    }
    setOpen((prev) => !prev);
  }

  function prevMonth() {
    if (navMonth === 0) { setNavYear((y) => y - 1); setNavMonth(11); }
    else setNavMonth((m) => m - 1);
  }

  function nextMonth() {
    if (navMonth === 11) { setNavYear((y) => y + 1); setNavMonth(0); }
    else setNavMonth((m) => m + 1);
  }

  function selectDate(dateStr: string) {
    onChange(dateStr);
    setOpen(false);
  }

  // Bygg kalenderdagar (måndag-first)
  const firstDay = new Date(navYear, navMonth, 1);
  const lastDay = new Date(navYear, navMonth + 1, 0);
  const firstWeekday = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

  const days: (string | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(`${navYear}-${String(navMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (days.length % 7 !== 0) days.push(null);

  const today = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();

  return (
    <div ref={ref} className="relative">
      {/* Hidden input för native form-validering */}
      <input type="hidden" value={value} required={required} />

      <button
        type="button"
        onClick={handleOpen}
        className={`text-left ${className || ''}`}
      >
        {value || <span className="text-gray-400">{placeholder || 'ÅÅÅÅ-MM-DD'}</span>}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-3 w-72">
          {/* Månadsnavigering */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 text-lg font-bold"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-gray-800">
              {MONTH_NAMES[navMonth]} {navYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 text-lg font-bold"
            >
              ›
            </button>
          </div>

          {/* Veckodagsrubriker */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Dagar */}
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((d, i) => {
              if (!d) return <div key={`e-${i}`} />;
              const isSelected = d === value;
              const isToday = d === today;
              const dayNum = parseInt(d.slice(8));
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => selectDate(d)}
                  className={`text-sm py-1.5 rounded text-center transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white font-semibold'
                      : isToday
                      ? 'bg-blue-50 text-blue-700 font-semibold ring-1 ring-blue-300'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          {/* Idag-knapp */}
          <div className="mt-2 pt-2 border-t border-gray-100 text-center">
            <button
              type="button"
              onClick={() => selectDate(today)}
              className="text-xs text-blue-600 hover:underline"
            >
              Idag ({today})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
