'use client';

import { useEffect, useState } from 'react';

interface VacationDay {
  id: number;
  date: string;
  note: string | null;
  createdAt: string;
}

interface VacationData {
  days: VacationDay[];
  allDays: VacationDay[];
  daysPerYear: number;
  bookedThisYear: number;
  remaining: number;
  year: number;
  yearStart: string;
  yearEnd: string;
}

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SemesterPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<VacationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [addDate, setAddDate] = useState(toLocalDateStr(new Date()));
  const [addNote, setAddNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [daysPerYearInput, setDaysPerYearInput] = useState<string>('');
  const [savingSettings, setSavingSettings] = useState(false);

  async function load(y: number) {
    setLoading(true);
    const res = await fetch(`/api/vacation-days?year=${y}`);
    if (res.ok) {
      const d = await res.json();
      setData(d);
      setDaysPerYearInput(String(d.daysPerYear));
    }
    setLoading(false);
  }

  useEffect(() => { load(year); }, [year]);

  function changeYear(delta: number) {
    setYear((y) => y + delta);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccessMsg('');

    const res = await fetch('/api/vacation-days', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: addDate, note: addNote || null }),
    });

    if (res.ok) {
      setAddNote('');
      // Om datumet tillhör valt år, ladda om det året, annars byt år
      const addedYear = parseInt(addDate.substring(0, 4));
      if (addedYear !== year) {
        setYear(addedYear);
      } else {
        await load(year);
      }
      setSuccessMsg('Semesterdag sparad!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } else {
      const d = await res.json();
      setError(d.error || 'Fel vid sparning');
    }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    const res = await fetch(`/api/vacation-days?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      await load(year);
    }
    setDeletingId(null);
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    const days = parseInt(daysPerYearInput);
    if (isNaN(days) || days < 0 || days > 365) {
      setSavingSettings(false);
      return;
    }
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vacationDaysPerYear: days }),
    });
    await load(year);
    setSavingSettings(false);
  }

  const today = toLocalDateStr(new Date());

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        Laddar...
      </div>
    );
  }

  if (!data) return null;

  const usedPct = data.daysPerYear > 0 ? Math.min(100, (data.bookedThisYear / data.daysPerYear) * 100) : 0;
  const upcoming = data.days.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = data.days.filter((d) => d.date < today).sort((a, b) => b.date.localeCompare(a.date));

  // Hur många dagar totalt i alla år (för översiktsrutan)
  const yearCounts: Record<number, number> = {};
  for (const d of (data.allDays ?? [])) {
    const y = parseInt(d.date.substring(0, 4));
    yearCounts[y] = (yearCounts[y] || 0) + 1;
  }
  const otherYears = Object.entries(yearCounts)
    .map(([y, count]) => ({ year: parseInt(y), count }))
    .filter((x) => x.year !== year)
    .sort((a, b) => b.year - a.year);

  return (
    <div className="space-y-6">
      {/* Header med årsnavigering */}
      <div className="bg-gradient-to-br from-emerald-700 to-teal-800 text-white rounded-2xl p-6">
        {/* Årsväxlare */}
        <div className="flex items-center justify-center gap-4 mb-5">
          <button
            onClick={() => changeYear(-1)}
            className="w-8 h-8 rounded-full bg-emerald-600/50 hover:bg-emerald-500/60 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center">
            <div className="text-2xl font-bold">{year}</div>
            <div className="text-emerald-200 text-xs">1 jan – 31 dec</div>
          </div>
          <button
            onClick={() => changeYear(1)}
            className="w-8 h-8 rounded-full bg-emerald-600/50 hover:bg-emerald-500/60 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Saldo-rader */}
        <div className="flex justify-center gap-8">
          <div className="text-center">
            <div className="text-3xl font-bold">{data.remaining}</div>
            <div className="text-emerald-200 text-xs mt-0.5">dagar kvar</div>
          </div>
          <div className="w-px bg-emerald-500/40" />
          <div className="text-center">
            <div className="text-3xl font-bold text-emerald-200">{data.bookedThisYear}</div>
            <div className="text-emerald-200 text-xs mt-0.5">bokade</div>
          </div>
          <div className="w-px bg-emerald-500/40" />
          <div className="text-center">
            <div className="text-3xl font-bold text-emerald-200">{data.daysPerYear}</div>
            <div className="text-emerald-200 text-xs mt-0.5">per år</div>
          </div>
        </div>

        {/* Förloppsindikator */}
        <div className="mt-5">
          <div className="flex justify-between text-xs text-emerald-200 mb-1.5">
            <span>{data.bookedThisYear} bokade</span>
            <span>{data.daysPerYear} totalt</span>
          </div>
          <div className="w-full bg-emerald-900/50 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${usedPct > 90 ? 'bg-red-400' : usedPct > 70 ? 'bg-yellow-300' : 'bg-emerald-300'}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>

        {/* Andra år med bokningar */}
        {otherYears.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {otherYears.map((oy) => (
              <button
                key={oy.year}
                onClick={() => setYear(oy.year)}
                className="text-xs bg-emerald-600/40 hover:bg-emerald-500/50 border border-emerald-400/30 px-2.5 py-1 rounded-full transition-colors"
              >
                {oy.year} · {oy.count} dag{oy.count !== 1 ? 'ar' : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Vänster kolumn: formulär + inställningar */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Registrera semesterdag</h2>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Datum</label>
                <input
                  type="date"
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Anteckning (valfri)</label>
                <input
                  type="text"
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                  placeholder="t.ex. sommarledighet"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>

              {error && (
                <p className="text-red-600 text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}
              {successMsg && (
                <p className="text-emerald-600 text-xs bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{successMsg}</p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                {saving ? 'Sparar...' : 'Lägg till semesterdag'}
              </button>
            </form>
          </div>

          {/* Inställningar */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Semesterdagar per år</h2>
            <form onSubmit={handleSaveSettings} className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Antal dagar</label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={daysPerYearInput}
                  onChange={(e) => setDaysPerYearInput(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <button
                type="submit"
                disabled={savingSettings}
                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                {savingSettings ? '...' : 'Spara'}
              </button>
            </form>
            <p className="text-xs text-gray-400 mt-2">
              Lagen kräver minst 25 dagar/år. Gäller alla år.
            </p>
          </div>
        </div>

        {/* Höger kolumn: lista */}
        <div className="lg:col-span-2 space-y-4">
          {loading && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-400 text-sm">
              Laddar {year}...
            </div>
          )}

          {!loading && upcoming.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">Kommande semester {year}</h2>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                  {upcoming.length} dag{upcoming.length !== 1 ? 'ar' : ''}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {upcoming.map((d) => (
                  <VacationDayRow key={d.id} day={d} onDelete={handleDelete} deletingId={deletingId} isUpcoming />
                ))}
              </div>
            </div>
          )}

          {!loading && past.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">Tagen semester {year}</h2>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                  {past.length} dag{past.length !== 1 ? 'ar' : ''}
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {past.slice(0, 25).map((d) => (
                  <VacationDayRow key={d.id} day={d} onDelete={handleDelete} deletingId={deletingId} isUpcoming={false} />
                ))}
                {past.length > 25 && (
                  <div className="px-5 py-3 text-xs text-gray-400 text-center">
                    + {past.length - 25} fler dagar
                  </div>
                )}
              </div>
            </div>
          )}

          {!loading && data.days.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm font-medium">Inga semesterdagar för {year}</p>
              <p className="text-gray-400 text-xs mt-1">Välj ett datum och lägg till dagar via formuläret</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VacationDayRow({
  day,
  onDelete,
  deletingId,
  isUpcoming,
}: {
  day: VacationDay;
  onDelete: (id: number) => void;
  deletingId: number | null;
  isUpcoming: boolean;
}) {
  const dateObj = new Date(day.date + 'T12:00:00');
  const weekday = dateObj.toLocaleDateString('sv-SE', { weekday: 'short' });
  const dayNum = dateObj.getDate();
  const month = dateObj.toLocaleDateString('sv-SE', { month: 'long' });

  return (
    <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center flex-shrink-0 ${isUpcoming ? 'bg-emerald-50' : 'bg-gray-50'}`}>
          <span className={`text-xs font-medium leading-none mb-0.5 ${isUpcoming ? 'text-emerald-500' : 'text-gray-400'}`}>{weekday}</span>
          <span className={`text-base font-bold leading-none ${isUpcoming ? 'text-emerald-700' : 'text-gray-500'}`}>{dayNum}</span>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-800 capitalize">{month}</p>
          {day.note && <p className="text-xs text-gray-400 mt-0.5">{day.note}</p>}
        </div>
      </div>
      <button
        onClick={() => onDelete(day.id)}
        disabled={deletingId === day.id}
        className="text-gray-300 hover:text-red-500 disabled:opacity-30 transition-colors p-1.5 rounded"
        title="Ta bort"
      >
        {deletingId === day.id ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        )}
      </button>
    </div>
  );
}
