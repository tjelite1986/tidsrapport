'use client';

import { useState, useRef, useEffect } from 'react';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

interface Props {
  value: string; // HH:MM
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
}

export default function TimePicker({ value, onChange, required, className, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const hour = value ? value.slice(0, 2) : null;
  const minute = value ? value.slice(3, 5) : null;

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

  function selectHour(h: string) {
    const m = minute ?? '00';
    onChange(`${h}:${m}`);
    // Håll picker öppen så användaren kan välja minut
  }

  function selectMinute(m: string) {
    const h = hour ?? '00';
    onChange(`${h}:${m}`);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      {/* Hidden input för native form-validering */}
      <input type="hidden" value={value} required={required} />

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`text-left ${className || ''}`}
      >
        {value || <span className="text-gray-400">{placeholder || '--:--'}</span>}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-3 w-64">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Välj tid (24h)</span>
            {value && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-red-500 hover:underline"
              >
                Rensa
              </button>
            )}
          </div>

          {/* Timmar — 6 kolumner x 4 rader */}
          <div className="mb-2">
            <div className="text-xs text-gray-400 mb-1">Timme</div>
            <div className="grid grid-cols-6 gap-0.5">
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => selectHour(h)}
                  className={`text-sm py-1 rounded text-center transition-colors ${
                    h === hour
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {/* Minuter — 6 kolumner x 2 rader */}
          <div>
            <div className="text-xs text-gray-400 mb-1">Minut</div>
            <div className="grid grid-cols-6 gap-0.5">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => selectMinute(m)}
                  className={`text-sm py-1 rounded text-center transition-colors ${
                    m === minute
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Vald tid */}
          {value && (
            <div className="mt-2 pt-2 border-t border-gray-100 text-center">
              <span className="text-sm font-semibold text-blue-700">{value}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
