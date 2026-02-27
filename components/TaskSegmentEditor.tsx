'use client';

import { useState } from 'react';
import TimePicker from '@/components/TimePicker';
import { TaskSegment, validateSegments } from '@/lib/types/segments';

interface Props {
  segments: TaskSegment[];
  onChange: (segments: TaskSegment[]) => void;
  departments: string[];
  passStart: string;
  passEnd: string;
}

export default function TaskSegmentEditor({ segments, onChange, departments, passStart, passEnd }: Props) {
  const [open, setOpen] = useState(segments.length > 0);

  if (departments.length === 0) return null;

  const { warnings } = validateSegments(segments, passStart, passEnd);

  function addSegment() {
    const newSeg: TaskSegment = {
      department: departments[0],
      startTime: passStart || '',
      endTime: passEnd || '',
    };
    const updated = [...segments, newSeg];
    onChange(updated);
    setOpen(true);
  }

  function updateSegment(index: number, field: keyof TaskSegment, value: string) {
    const updated = segments.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    onChange(updated);
  }

  function removeSegment(index: number) {
    onChange(segments.filter((_, i) => i !== index));
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        <svg
          className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Avdelningsloggning
        {segments.length > 0 && (
          <span className="ml-1 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">{segments.length}</span>
        )}
      </button>

      {open && (
        <div className="mt-3 border border-gray-200 rounded-lg p-4 bg-gray-50">
          {warnings.length > 0 && (
            <div className="mb-3 bg-yellow-50 border border-yellow-200 rounded p-2">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-yellow-800">{w}</p>
              ))}
            </div>
          )}

          {segments.length === 0 ? (
            <p className="text-sm text-gray-500 mb-3">Inga segment tillagda.</p>
          ) : (
            <div className="space-y-2 mb-3">
              {segments.map((seg, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  <select
                    value={seg.department}
                    onChange={(e) => updateSegment(i, 'department', e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white min-w-[120px]"
                  >
                    {departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <TimePicker
                    value={seg.startTime}
                    onChange={(v) => updateSegment(i, 'startTime', v)}
                    placeholder="Start"
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white w-20"
                  />
                  <span className="text-gray-400 text-sm">–</span>
                  <TimePicker
                    value={seg.endTime}
                    onChange={(v) => updateSegment(i, 'endTime', v)}
                    placeholder="Slut"
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm bg-white w-20"
                  />
                  <button
                    type="button"
                    onClick={() => removeSegment(i)}
                    className="text-red-500 hover:text-red-700 text-lg leading-none px-1"
                    title="Ta bort"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={addSegment}
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            + Lägg till avdelning
          </button>
        </div>
      )}
    </div>
  );
}
