'use client';

import { useState, useEffect } from 'react';
import DatePicker from '@/components/DatePicker';
import TimePicker from '@/components/TimePicker';

interface TimeEntryDetail {
  id: number;
  projectId: number;
  projectName: string;
  date: string;
  hours: number;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number | null;
  entryType: string;
  overtimeType: string;
  description: string | null;
}

interface Project {
  id: number;
  name: string;
  active: boolean;
}

interface Props {
  entry: TimeEntryDetail | null;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
}

function calcHoursPreview(startTime: string, endTime: string, breakMin: number): string {
  if (!startTime || !endTime) return '';
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;
  if (endMinutes <= startMinutes) endMinutes += 1440;
  const total = (endMinutes - startMinutes - breakMin) / 60;
  return total > 0 ? total.toFixed(2) : '0';
}

export default function EditTimeEntryDialog({ entry, projects, onClose, onSaved }: Props) {
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [breakMinutes, setBreakMinutes] = useState('');
  const [breakMode, setBreakMode] = useState<'minutes' | 'time'>('minutes');
  const [breakStart, setBreakStart] = useState('');
  const [breakEnd, setBreakEnd] = useState('');
  const [entryType, setEntryType] = useState('work');
  const [overtimeType, setOvertimeType] = useState('none');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!entry) return;
    setProjectId(String(entry.projectId));
    setDate(entry.date);
    setStartTime(entry.startTime || '');
    setEndTime(entry.endTime || '');
    setBreakMinutes(String(entry.breakMinutes ?? 0));
    setBreakMode('minutes');
    setBreakStart('');
    setBreakEnd('');
    setEntryType(entry.entryType);
    setOvertimeType(entry.overtimeType);
    setDescription(entry.description || '');
  }, [entry]);

  useEffect(() => {
    if (breakMode !== 'time' || !breakStart || !breakEnd) return;
    const [sh, sm] = breakStart.split(':').map(Number);
    const [eh, em] = breakEnd.split(':').map(Number);
    const mins = Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
    setBreakMinutes(String(mins));
  }, [breakStart, breakEnd, breakMode]);

  if (!entry) return null;

  const previewHours = calcHoursPreview(startTime, endTime, parseInt(breakMinutes) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/time-entries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry!.id,
          projectId: parseInt(projectId),
          date,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          breakMinutes: startTime && endTime ? parseInt(breakMinutes) || 0 : undefined,
          entryType,
          overtimeType,
          description: description || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Kunde inte spara');
        return;
      }

      onSaved();
      onClose();
    } catch {
      setError('Nätverksfel');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 sm:p-6 border-b flex justify-between items-center">
          <h2 className="text-lg font-bold">Redigera tidsregistrering</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Projekt</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Välj projekt</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Datum</label>
            <DatePicker
              value={date}
              onChange={setDate}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Starttid</label>
              <TimePicker
                value={startTime}
                onChange={setStartTime}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sluttid</label>
              <TimePicker
                value={endTime}
                onChange={setEndTime}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rast
                <span className="ml-2 inline-flex rounded overflow-hidden border border-gray-200 text-xs align-middle">
                  <button type="button"
                    onClick={() => setBreakMode('minutes')}
                    className={`px-2 py-0.5 transition-colors ${breakMode === 'minutes' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                    min
                  </button>
                  <button type="button"
                    onClick={() => setBreakMode('time')}
                    className={`px-2 py-0.5 transition-colors border-l border-gray-200 ${breakMode === 'time' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                    tid
                  </button>
                </span>
              </label>
              {breakMode === 'time' ? (
                <div>
                  <div className="grid grid-cols-2 gap-1">
                    <TimePicker
                      value={breakStart}
                      onChange={setBreakStart}
                      placeholder="Start"
                      className="w-full px-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <TimePicker
                      value={breakEnd}
                      onChange={setBreakEnd}
                      placeholder="Slut"
                      className="w-full px-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  {breakMinutes && <p className="text-xs text-gray-500 mt-1">= {breakMinutes} min</p>}
                </div>
              ) : (
                <input
                  type="number"
                  min="0"
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="work">Arbete</option>
                <option value="sick">Sjukdag</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Övertid</label>
            <select
              value={overtimeType}
              onChange={(e) => setOvertimeType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="none">Ingen</option>
              <option value="mertid">Mertid (+35%)</option>
              <option value="enkel">Enkel övertid (+35%)</option>
              <option value="kvalificerad">Kvalificerad övertid (+70%)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivning</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {previewHours && (
            <p className="text-sm text-gray-600">
              Beräknade timmar: <strong className="text-blue-600">{previewHours}h</strong>
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? 'Sparar...' : 'Spara ändringar'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
            >
              Avbryt
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
