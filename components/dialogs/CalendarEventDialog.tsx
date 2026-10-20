'use client';

import { useState, useEffect } from 'react';
import DatePicker from '@/components/DatePicker';
import TimePicker from '@/components/TimePicker';

export interface CalendarEventDraft {
  id?: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  note: string | null;
}

interface Props {
  event: CalendarEventDraft | null;
  onClose: () => void;
  onSaved: () => void;
}

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function CalendarEventDialog({ event, onClose, onSaved }: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!event) return;
    setTitle(event.title);
    setDate(event.date);
    setAllDay(event.id !== undefined && !event.startTime);
    setStartTime(event.startTime ?? '');
    setEndTime(event.endTime ?? '');
    setNote(event.note ?? '');
    setError('');
    setSaving(false);
    setConfirmDelete(false);
  }, [event]);

  if (!event) return null;
  const isNew = event.id === undefined;

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
    setSaving(true);
    const body = {
      id: event!.id,
      date,
      title,
      note,
      startTime: allDay ? null : startTime,
      endTime: allDay ? null : endTime || null,
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

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const res = await fetch(`/api/calendar-events?id=${event!.id}`, { method: 'DELETE' });
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Datum</label>
            <DatePicker value={date} onChange={setDate} required className={inputClass} />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            Heldag
          </label>

          {!allDay && (
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[120px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                <TimePicker value={startTime} onChange={setStartTime} required className={inputClass} />
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">Slut (valfritt)</label>
                <TimePicker value={endTime} onChange={setEndTime} className={inputClass} />
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

          <p className="text-xs text-gray-500">Händelser syns bara för dig och påverkar inte lönen.</p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
              Spara
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50">
              Avbryt
            </button>
            {!isNew && (
              <button type="button" onClick={handleDelete} className="ml-auto text-red-600 hover:underline text-sm">
                {confirmDelete ? 'Bekräfta borttagning' : 'Ta bort'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
