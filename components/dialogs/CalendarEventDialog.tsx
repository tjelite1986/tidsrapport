'use client';

import { useState, useEffect, useRef } from 'react';
import DatePicker from '@/components/DatePicker';
import TimePicker, { TimePickerHandle } from '@/components/TimePicker';

export interface CalendarEventDraft {
  id?: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  note: string | null;
  recurrence?: string;
  recurrenceUntil?: string | null;
  // First date of a recurring series; `date` is then the occurrence that was clicked
  seriesDate?: string;
}

interface Props {
  event: CalendarEventDraft | null;
  onClose: () => void;
  onSaved: () => void;
}

const recurrenceOptions = [
  { value: 'none', label: 'Upprepas inte' },
  { value: 'daily', label: 'Varje dag' },
  { value: 'weekly', label: 'Varje vecka' },
  { value: 'biweekly', label: 'Varannan vecka' },
  { value: 'monthly', label: 'Varje månad' },
];

function formatShortDate(date: string) {
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
}

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function CalendarEventDialog({ event, onClose, onSaved }: Props) {
  const endTimePicker = useRef<TimePickerHandle>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [note, setNote] = useState('');
  const [recurrence, setRecurrence] = useState('none');
  const [recurrenceUntil, setRecurrenceUntil] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<'one' | 'all' | null>(null);

  useEffect(() => {
    if (!event) return;
    setTitle(event.title);
    // A recurring event is edited as a series, so the form shows its first date
    setDate(event.seriesDate ?? event.date);
    setAllDay(event.id !== undefined && !event.startTime);
    setStartTime(event.startTime ?? '');
    setEndTime(event.endTime ?? '');
    setNote(event.note ?? '');
    setRecurrence(event.recurrence ?? 'none');
    setRecurrenceUntil(event.recurrenceUntil ?? '');
    setError('');
    setSaving(false);
    setConfirmDelete(null);
  }, [event]);

  if (!event) return null;
  const isNew = event.id === undefined;
  const wasRecurring = !isNew && (event.recurrence ?? 'none') !== 'none';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!allDay && !startTime) {
      setError('Ange en starttid eller välj heldag.');
      return;
    }
    if (!allDay && endTime && endTime <= startTime) {
      setError('Sluttiden måste vara efter starttiden.');
      return;
    }
    if (recurrence !== 'none' && recurrenceUntil && recurrenceUntil < date) {
      setError('Slutdatumet för upprepningen måste vara efter första datumet.');
      return;
    }
    setSaving(true);
    const body = {
      id: event!.id,
      date,
      title,
      note,
      startTime: allDay ? null : startTime,
      endTime: allDay ? null : endTime || null,
      recurrence,
      recurrenceUntil: recurrence === 'none' ? null : recurrenceUntil || null,
    };
    const res = await fetch('/api/calendar-events', {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setError('Kunde inte spara händelsen.');
      return;
    }
    onSaved();
    onClose();
  }

  async function handleDelete(scope: 'one' | 'all') {
    if (confirmDelete !== scope) {
      setConfirmDelete(scope);
      return;
    }
    const query = scope === 'one' ? `&occurrence=${event!.date}` : '';
    const res = await fetch(`/api/calendar-events?id=${event!.id}${query}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('Kunde inte ta bort händelsen.');
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 sm:p-6 border-b flex justify-between items-center">
          <h2 className="text-lg font-bold">{isNew ? 'Ny händelse' : 'Redigera händelse'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
              placeholder="T.ex. Möte, tandläkare"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {recurrence === 'none' ? 'Datum' : 'Första datum'}
            </label>
            <DatePicker value={date} onChange={setDate} required className={inputClass} />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">Upprepa</label>
              <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={inputClass}>
                {recurrenceOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {recurrence !== 'none' && (
              <div className="flex-1 min-w-[150px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Till och med (valfritt)</label>
                <DatePicker value={recurrenceUntil} onChange={setRecurrenceUntil} className={inputClass} placeholder="Tills vidare" />
                {recurrenceUntil && (
                  <button type="button" onClick={() => setRecurrenceUntil('')} className="mt-1 text-xs text-blue-600 hover:underline">
                    Ta bort slutdatum
                  </button>
                )}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            Heldag
          </label>

          {!allDay && (
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[120px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                <TimePicker
                  value={startTime}
                  onChange={setStartTime}
                  required
                  title="Start"
                  onPicked={() => endTimePicker.current?.open()}
                  className={inputClass}
                />
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Slut (valfritt)</label>
                <TimePicker ref={endTimePicker} value={endTime} onChange={setEndTime} title="Slut" className={inputClass} />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Anteckning (valfritt)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={1000}
              className={inputClass}
            />
          </div>

          {wasRecurring && (
            <p className="text-xs text-gray-500">Ändringar gäller alla tillfällen i serien.</p>
          )}
          <p className="text-xs text-gray-500">Händelser syns bara för dig och påverkar inte lönen.</p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
              Spara
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50">
              Avbryt
            </button>
            {!isNew && (
              <div className="ml-auto flex flex-col items-end gap-1">
                {wasRecurring && (
                  <button type="button" onClick={() => handleDelete('one')} className="text-red-600 hover:underline text-sm">
                    {confirmDelete === 'one' ? 'Bekräfta' : `Ta bort bara ${formatShortDate(event.date)}`}
                  </button>
                )}
                <button type="button" onClick={() => handleDelete('all')} className="text-red-600 hover:underline text-sm">
                  {confirmDelete === 'all' ? 'Bekräfta borttagning' : wasRecurring ? 'Ta bort alla' : 'Ta bort'}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
