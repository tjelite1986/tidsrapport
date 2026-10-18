'use client';

import { useState, useRef } from 'react';

interface ParsedShift {
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  /** The user already has an entry on this date — left unchecked by default. */
  existing: boolean;
}

interface Project {
  id: number;
  name: string;
  active: boolean;
}

interface Props {
  open: boolean;
  projects: Project[];
  onClose: () => void;
  onImported: () => void;
}

const DAY_NAMES = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];
const MONTH_NAMES = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];

function shiftLabel(shift: ParsedShift): string {
  const d = new Date(shift.date + 'T12:00:00');
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

/** "2026-03" → "mars 2026" */
function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${year}`;
}

/** The API answers in English; the dialog speaks the product's Swedish. */
function describeError(status: number, detail: string | undefined): string {
  const headline =
    status === 415 ? 'Filformatet stöds inte. Använd PNG, JPG eller WEBP.'
    : status === 413 ? 'Bilden är för stor (max 10 MB).'
    : status === 503 ? 'AI-avläsning är inte konfigurerad på servern.'
    : status === 502 ? 'Kunde inte läsa av schemat. Försök med en tydligare bild som visar veckonummer och datum.'
    : 'Kunde inte analysera bilden.';
  return detail ? `${headline} (${detail})` : headline;
}

type Step = 'upload' | 'analyzing' | 'confirm' | 'importing' | 'done';

export default function ScheduleImportDialog({ open, projects, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [shifts, setShifts] = useState<ParsedShift[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState('');
  const [importedCount, setImportedCount] = useState(0);
  const [month, setMonth] = useState('');
  const [outsideMonth, setOutsideMonth] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError('');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError('');
  }

  async function analyzeImage() {
    if (!imageFile) return;
    setStep('analyzing');
    setError('');

    const formData = new FormData();
    formData.append('image', imageFile);

    try {
      const res = await fetch('/api/schedule-import', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(describeError(res.status, data.error));
        setStep('upload');
        return;
      }

      const parsed: ParsedShift[] = (data.shifts || []).map((s: ParsedShift) => ({
        ...s,
        breakMinutes: 0,
        existing: Boolean(s.existing),
      }));

      if (parsed.length === 0) {
        setError(`Schemat tolkades som ${monthLabel(data.month)} men inga arbetspass hittades. Försök med en tydligare bild.`);
        setStep('upload');
        return;
      }

      setMonth(data.month);
      setOutsideMonth(data.outsideMonth || 0);
      setShifts(parsed);
      // Dates that already have an entry stay unchecked so a second upload
      // of the same schedule does not double the month
      setSelected(new Set(parsed.map((s, i) => (s.existing ? -1 : i)).filter((i) => i >= 0)));

      if (!projectId) {
        const first = projects.find((p) => p.active);
        if (first) setProjectId(String(first.id));
      }

      setStep('confirm');
    } catch {
      setError('Nätverksfel – försök igen');
      setStep('upload');
    }
  }

  async function importShifts() {
    if (!projectId) { setError('Välj ett projekt'); return; }
    setStep('importing');
    setError('');
    let count = 0;

    for (const [idx, shift] of shifts.entries()) {
      if (!selected.has(idx)) continue;
      const res = await fetch('/api/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: parseInt(projectId),
          date: shift.date,
          startTime: shift.startTime,
          endTime: shift.endTime,
          breakMinutes: shift.breakMinutes || 0,
        }),
      });
      if (res.ok) count++;
    }

    setImportedCount(count);
    setStep('done');
  }

  function reset() {
    setStep('upload');
    setImageFile(null);
    setPreviewUrl('');
    setShifts([]);
    setSelected(new Set());
    setProjectId('');
    setError('');
    setImportedCount(0);
    setMonth('');
    setOutsideMonth(0);
  }

  function handleClose() {
    const wasImported = importedCount > 0;
    reset();
    onClose();
    if (wasImported) onImported();
  }

  function toggleAll() {
    setSelected(selected.size === shifts.length ? new Set() : new Set(shifts.map((_, i) => i)));
  }

  function toggleOne(idx: number) {
    const next = new Set(selected);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSelected(next);
  }

  function updateShift(idx: number, field: keyof ParsedShift, value: string | number) {
    setShifts((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-6 border-b flex justify-between items-center">
          <h2 className="text-lg font-bold">Importera schema</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            &times;
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {/* STEP: UPLOAD */}
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Ladda upp en skärmdump av ditt arbetsschema. Månaden läses av från veckonumren och
                dagarna i bilden, och passen läggs in på rätt datum.
              </p>

              {error && <div className="bg-red-50 text-red-700 p-3 rounded text-sm">{error}</div>}

              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="Schema" className="max-h-56 mx-auto rounded object-contain" />
                ) : (
                  <div>
                    <p className="text-gray-500 text-sm">Klicka eller dra hit en bild</p>
                    <p className="text-gray-400 text-xs mt-1">PNG, JPG, WEBP</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />

              {imageFile && (
                <button
                  onClick={analyzeImage}
                  className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition"
                >
                  Analysera schema
                </button>
              )}
            </div>
          )}

          {/* STEP: ANALYZING */}
          {step === 'analyzing' && (
            <div className="py-12 text-center">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Analyserar bilden...</p>
              <p className="text-gray-400 text-sm mt-1">AI:n läser av schemat, detta tar några sekunder</p>
            </div>
          )}

          {/* STEP: CONFIRM */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-800">{monthLabel(month)}</span>:{' '}
                {shifts.length} arbetspass hittades
                {shifts.some((s) => s.existing) && (
                  <>, {shifts.filter((s) => s.existing).length} dagar har redan en post och är avmarkerade</>
                )}
                {outsideMonth > 0 && <>. {outsideMonth} pass från en annan månad i bilden hoppades över</>}
                .
              </p>

              {error && <div className="bg-red-50 text-red-700 p-3 rounded text-sm">{error}</div>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Projekt</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Välj projekt...</option>
                  {projects.filter((p) => p.active).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Arbetspass</span>
                  <button onClick={toggleAll} className="text-xs text-blue-600 hover:underline">
                    {selected.size === shifts.length ? 'Avmarkera alla' : 'Markera alla'}
                  </button>
                </div>
                <div className="border rounded-lg overflow-hidden divide-y max-h-72 overflow-y-auto">
                  {shifts.map((shift, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(idx)}
                        onChange={() => toggleOne(idx)}
                        className="w-4 h-4 text-blue-600 rounded flex-shrink-0"
                      />
                      <span className="text-sm flex-1 text-gray-800 min-w-0 truncate">
                        {shiftLabel(shift)}
                        {shift.existing && <span className="ml-1 text-xs text-amber-600">finns redan</span>}
                      </span>
                      <input
                        type="time"
                        value={shift.startTime}
                        onChange={(e) => updateShift(idx, 'startTime', e.target.value)}
                        className="text-sm border border-gray-200 rounded px-1.5 py-1 font-mono w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <span className="text-gray-400 text-sm">–</span>
                      <input
                        type="time"
                        value={shift.endTime}
                        onChange={(e) => updateShift(idx, 'endTime', e.target.value)}
                        className="text-sm border border-gray-200 rounded px-1.5 py-1 font-mono w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={shift.breakMinutes || ''}
                        onChange={(e) => updateShift(idx, 'breakMinutes', parseInt(e.target.value) || 0)}
                        placeholder="Rast"
                        title="Rast i minuter"
                        className="text-sm border border-gray-200 rounded px-1.5 py-1 w-16 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">{selected.size} av {shifts.length} valda</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={importShifts}
                  disabled={selected.size === 0 || !projectId}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  Importera {selected.size > 0 ? `${selected.size} pass` : ''}
                </button>
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                >
                  Tillbaka
                </button>
              </div>
            </div>
          )}

          {/* STEP: IMPORTING */}
          {step === 'importing' && (
            <div className="py-12 text-center">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Importerar pass...</p>
            </div>
          )}

          {/* STEP: DONE */}
          {step === 'done' && (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-800">{importedCount} pass importerade</p>
                <p className="text-sm text-gray-500 mt-1">Tidsregistreringarna för {monthLabel(month)} är sparade</p>
              </div>
              <button
                onClick={handleClose}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition"
              >
                Stäng
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
