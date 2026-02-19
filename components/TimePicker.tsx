'use client';

import { useState } from 'react';

interface Props {
  value: string; // HH:MM
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// Yttre ring: 12, 1, 2, ... 11
const OUTER_HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
// Inre ring: 00, 13, 14, ... 23
const INNER_HOURS = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
// Minuter på yttre ring
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const SIZE = 280;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUTER = 112;
const R_INNER = 72;
const HAND_OUTER = 108;
const HAND_INNER = 68;

function polarToXY(index: number, radius: number) {
  const angle = (index * 30 - 90) * (Math.PI / 180);
  return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
}

function hourToPos(h: number): { x: number; y: number; handR: number } {
  if (h === 0)  return { ...polarToXY(0, R_INNER),  handR: HAND_INNER };
  if (h === 12) return { ...polarToXY(0, R_OUTER),  handR: HAND_OUTER };
  if (h <= 11)  return { ...polarToXY(h, R_OUTER),  handR: HAND_OUTER };
  return          { ...polarToXY(h - 12, R_INNER), handR: HAND_INNER };
}

function minuteToPos(m: number) {
  return { ...polarToXY(m / 5, R_OUTER), handR: HAND_OUTER };
}

export default function TimePicker({ value, onChange, required, className, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'hour' | 'minute' | 'text'>('hour');
  const [pendingHour, setPendingHour] = useState<number | null>(null);
  const [pendingMinute, setPendingMinute] = useState<number | null>(null);
  const [textInput, setTextInput] = useState('');

  function handleOpen() {
    const h = value ? parseInt(value.slice(0, 2)) : null;
    const m = value ? parseInt(value.slice(3, 5)) : null;
    setPendingHour(h);
    setPendingMinute(m);
    setTextInput(value || '');
    setMode('hour');
    setOpen(true);
  }

  function selectHour(h: number) {
    setPendingHour(h);
    setMode('minute');
  }

  function selectMinute(m: number) {
    setPendingMinute(m);
  }

  function handleSet() {
    if (mode === 'text') {
      const match = textInput.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
      if (match) {
        onChange(`${pad(parseInt(match[1]))}:${match[2]}`);
        setOpen(false);
      }
      return;
    }
    const h = pendingHour ?? 0;
    const m = pendingMinute ?? 0;
    onChange(`${pad(h)}:${pad(m)}`);
    setOpen(false);
  }

  function handleClear() {
    onChange('');
    setOpen(false);
  }

  function handleCancel() {
    setOpen(false);
  }

  // Beräkna klockvisarens slutpunkt
  let handEnd = { x: CX, y: CY };
  if (mode === 'hour' && pendingHour !== null) {
    const pos = hourToPos(pendingHour);
    handEnd = polarToXY(
      pendingHour === 0 || pendingHour === 12 ? 0 :
      pendingHour <= 11 ? pendingHour : pendingHour - 12,
      pos.handR
    );
  } else if (mode === 'minute' && pendingMinute !== null) {
    handEnd = polarToXY(pendingMinute / 5, HAND_OUTER);
  }

  const showHand = (mode === 'hour' && pendingHour !== null) ||
                   (mode === 'minute' && pendingMinute !== null);

  const displayHour   = pendingHour !== null ? pad(pendingHour) : '--';
  const displayMinute = pendingMinute !== null ? pad(pendingMinute) : '--';

  return (
    <div className="relative">
      <input type="hidden" value={value} required={required} />

      <button
        type="button"
        onClick={handleOpen}
        className={`text-left ${className || ''}`}
      >
        {value || <span className="text-gray-400">{placeholder || '--:--'}</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1c1b1f] rounded-3xl overflow-hidden w-full max-w-[320px] shadow-2xl">

            {/* Tidsdisplay */}
            <div className="bg-[#2c2b2f] px-8 pt-6 pb-4">
              <div className="text-xs text-gray-400 mb-2 uppercase tracking-widest">Välj tid</div>
              <div className="flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => setMode('hour')}
                  className={`text-6xl font-light tabular-nums rounded-lg px-2 py-1 transition-colors ${
                    mode === 'hour' ? 'text-white bg-blue-800/40' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {displayHour}
                </button>
                <span className="text-6xl font-light text-gray-300 select-none">:</span>
                <button
                  type="button"
                  onClick={() => setMode('minute')}
                  className={`text-6xl font-light tabular-nums rounded-lg px-2 py-1 transition-colors ${
                    mode === 'minute' ? 'text-white bg-blue-800/40' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {displayMinute}
                </button>
              </div>
            </div>

            {/* Urtavla eller textinmatning */}
            {mode === 'text' ? (
              <div className="flex justify-center items-center bg-[#111014] py-10 px-6">
                <input
                  type="text"
                  autoFocus
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="HH:MM"
                  className="bg-[#2c2b2f] text-white text-3xl text-center rounded-xl px-4 py-3 w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={5}
                />
              </div>
            ) : (
              <div className="flex justify-center bg-[#111014] py-5">
                <svg width={SIZE} height={SIZE} style={{ touchAction: 'none' }}>
                  {/* Urtavlans bakgrund */}
                  <circle cx={CX} cy={CY} r={SIZE / 2 - 2} fill="#2c2b2f" />

                  {/* Klockvist */}
                  {showHand && (
                    <>
                      <line
                        x1={CX} y1={CY}
                        x2={handEnd.x} y2={handEnd.y}
                        stroke="#aac8ff"
                        strokeWidth="2"
                      />
                      <circle cx={CX} cy={CY} r="4" fill="#aac8ff" />
                    </>
                  )}

                  {/* Timmars yttre ring (12, 1–11) */}
                  {mode === 'hour' && OUTER_HOURS.map((h, i) => {
                    const { x, y } = polarToXY(i, R_OUTER);
                    const isSel = pendingHour === h;
                    return (
                      <g key={h} onClick={() => selectHour(h)} style={{ cursor: 'pointer' }}>
                        {isSel && <circle cx={x} cy={y} r="20" fill="#aac8ff" />}
                        <text
                          x={x} y={y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill={isSel ? '#1c1b1f' : '#e5e7eb'}
                          fontSize="16"
                          fontWeight={isSel ? '700' : '400'}
                        >
                          {h}
                        </text>
                      </g>
                    );
                  })}

                  {/* Timmars inre ring (00, 13–23) */}
                  {mode === 'hour' && INNER_HOURS.map((h, i) => {
                    const { x, y } = polarToXY(i, R_INNER);
                    const isSel = pendingHour === h;
                    return (
                      <g key={`i${h}`} onClick={() => selectHour(h)} style={{ cursor: 'pointer' }}>
                        {isSel && <circle cx={x} cy={y} r="17" fill="#aac8ff" />}
                        <text
                          x={x} y={y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill={isSel ? '#1c1b1f' : '#9ca3af'}
                          fontSize="13"
                          fontWeight={isSel ? '700' : '400'}
                        >
                          {pad(h)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Minutring */}
                  {mode === 'minute' && MINUTES.map((m, i) => {
                    const { x, y } = polarToXY(i, R_OUTER);
                    const isSel = pendingMinute === m;
                    return (
                      <g key={m} onClick={() => selectMinute(m)} style={{ cursor: 'pointer' }}>
                        {isSel && <circle cx={x} cy={y} r="20" fill="#aac8ff" />}
                        <text
                          x={x} y={y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill={isSel ? '#1c1b1f' : '#e5e7eb'}
                          fontSize="15"
                          fontWeight={isSel ? '700' : '400'}
                        >
                          {pad(m)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}

            {/* Knappar */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#1c1b1f]">
              {/* Tangentbordsknapp */}
              <button
                type="button"
                onClick={() => setMode(mode === 'text' ? 'hour' : 'text')}
                className="p-2 text-gray-400 hover:text-gray-200 transition-colors"
                title="Textinmatning"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="2" y="6" width="20" height="12" rx="2" strokeWidth="2" />
                  <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-blue-400 hover:text-blue-200 font-medium text-sm px-3 py-1.5 rounded-lg hover:bg-blue-900/30 transition-colors"
                >
                  Rensa
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-blue-400 hover:text-blue-200 font-medium text-sm px-3 py-1.5 rounded-lg hover:bg-blue-900/30 transition-colors"
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  onClick={handleSet}
                  className="text-blue-400 hover:text-blue-200 font-medium text-sm px-3 py-1.5 rounded-lg hover:bg-blue-900/30 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
