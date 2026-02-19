'use client';

import { useEffect, useState } from 'react';
import { getWeekType } from '@/lib/calculations/time-utils';
import DatePicker from '@/components/DatePicker';

const contractOptions = [
  { value: '16ar', label: '16 år (101,48 kr/h)' },
  { value: '17ar', label: '17 år (103,95 kr/h)' },
  { value: '18ar', label: '18 år (155,51 kr/h)' },
  { value: '19ar', label: '19 år (157,44 kr/h)' },
  { value: '1ar_erf', label: '1 års erfarenhet (160,95 kr/h)' },
  { value: '2ar', label: '2 års erfarenhet (162,98 kr/h)' },
  { value: '3plus', label: '3+ års erfarenhet (165,84 kr/h)' },
];

const dayNames = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];

interface Template {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

interface ScheduleEntry {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

function emptyWeek(): ScheduleEntry[] {
  return Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, startTime: '', endTime: '', breakMinutes: 0 }));
}

const monthNames = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];

function ScheduleMonthPreview({
  referenceDate,
  scheduleA,
  scheduleB,
}: {
  referenceDate: string;
  scheduleA: ScheduleEntry[];
  scheduleB: ScheduleEntry[];
}) {
  const [previewDate, setPreviewDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const { year, month } = previewDate;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Veckans startdag (måndag=0)
  const firstWeekday = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

  const days: { date: string; weekType: 'A' | 'B'; entry: ScheduleEntry | null }[] = [];
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const wt = getWeekType(dateStr, referenceDate);
    const jsDay = new Date(dateStr + 'T12:00:00').getDay();
    const dow = jsDay === 0 ? 6 : jsDay - 1;
    const schedule = wt === 'A' ? scheduleA : scheduleB;
    const entry = schedule.find((s) => s.dayOfWeek === dow) || null;
    days.push({ date: dateStr, weekType: wt, entry: entry && entry.startTime ? entry : null });
  }

  return (
    <div className="mt-6 border border-blue-200 rounded-lg p-4 bg-blue-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-blue-800">Månadspreview</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewDate(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 })}
            className="px-2 py-0.5 rounded text-blue-700 hover:bg-blue-100 text-lg font-bold"
          >
            ‹
          </button>
          <span className="text-sm font-medium text-blue-800 w-36 text-center">{monthNames[month]} {year}</span>
          <button
            type="button"
            onClick={() => setPreviewDate(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 })}
            className="px-2 py-0.5 rounded text-blue-700 hover:bg-blue-100 text-lg font-bold"
          >
            ›
          </button>
        </div>
      </div>

      {/* Veckodagsrubriker */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Mån','Tis','Ons','Tor','Fre','Lör','Sön'].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
        ))}
      </div>

      {/* Dagar */}
      <div className="grid grid-cols-7 gap-1">
        {/* Tomma celler för att justera första veckodagen */}
        {Array.from({ length: firstWeekday }, (_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {days.map(({ date, weekType, entry }) => {
          const dayNum = parseInt(date.split('-')[2]);
          const isA = weekType === 'A';
          return (
            <div
              key={date}
              className={`rounded p-1 text-center min-h-[52px] flex flex-col items-center justify-start border ${
                isA ? 'bg-blue-100 border-blue-300' : 'bg-purple-100 border-purple-300'
              }`}
            >
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium text-gray-700">{dayNum}</span>
                <span className={`text-xs font-bold ${isA ? 'text-blue-700' : 'text-purple-700'}`}>{weekType}</span>
              </div>
              {entry ? (
                <span className="text-xs text-gray-600 leading-tight mt-0.5">{entry.startTime}–{entry.endTime}</span>
              ) : (
                <span className="text-xs text-gray-400 mt-0.5">Ledigt</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Teckenförklaring */}
      <div className="flex gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-blue-300 border border-blue-400" />
          <span className="text-xs text-gray-600">Vecka A</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-purple-300 border border-purple-400" />
          <span className="text-xs text-gray-600">Vecka B</span>
        </div>
      </div>
    </div>
  );
}

export default function InstallningarPage() {
  const [settings, setSettings] = useState({
    workplaceType: 'none',
    contractLevel: '3plus',
    taxRate: 30,
    vacationPayRate: 12,
    vacationPayMode: 'included',
    workingHoursPerMonth: 160,
    autoBreakCalc: true,
    employeeName: '',
    employerName: '',
    defaultStartTime: '',
    defaultEndTime: '',
    calendarViewDefault: 'week',
    taxMode: 'percentage' as string,
    taxTable: null as number | null,
    municipality: '' as string,
  });
  const [municipalities, setMunicipalities] = useState<{ name: string; taxRate: number; tableNumber: number }[]>([]);
  const [municipalitySearch, setMunicipalitySearch] = useState('');
  const [saved, setSaved] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newTemplate, setNewTemplate] = useState({ name: '', startTime: '08:00', endTime: '17:00', breakMinutes: 60 });
  const [scheduleA, setScheduleA] = useState<ScheduleEntry[]>(emptyWeek());
  const [scheduleB, setScheduleB] = useState<ScheduleEntry[]>(emptyWeek());
  const [referenceDate, setReferenceDate] = useState<string>('');
  const [activeScheduleTab, setActiveScheduleTab] = useState<'A' | 'B'>('A');

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((data) => {
      setSettings({
        workplaceType: data.workplaceType || 'none',
        contractLevel: data.contractLevel || '3plus',
        taxRate: data.taxRate ?? 30,
        vacationPayRate: data.vacationPayRate ?? 12,
        vacationPayMode: data.vacationPayMode || 'included',
        workingHoursPerMonth: data.workingHoursPerMonth ?? 160,
        autoBreakCalc: data.autoBreakCalc ?? true,
        employeeName: data.employeeName || '',
        employerName: data.employerName || '',
        defaultStartTime: data.defaultStartTime || '',
        defaultEndTime: data.defaultEndTime || '',
        calendarViewDefault: data.calendarViewDefault || 'week',
        taxMode: data.taxMode || 'percentage',
        taxTable: data.taxTable ?? null,
        municipality: data.municipality || '',
      });
      if (data.municipality) setMunicipalitySearch(data.municipality);
    });
    fetch('/api/municipalities').then((r) => r.json()).then(setMunicipalities);
    fetch('/api/templates').then((r) => r.json()).then(setTemplates);
    fetch('/api/schedule').then((r) => r.json()).then((data) => {
      setScheduleA(data.scheduleA || emptyWeek());
      setScheduleB(data.scheduleB || emptyWeek());
      setReferenceDate(data.referenceDate || '');
    });
  }, []);

  async function saveSettings() {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function addTemplate() {
    if (!newTemplate.name || !newTemplate.startTime || !newTemplate.endTime) return;
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTemplate),
    });
    if (res.ok) {
      const t = await res.json();
      setTemplates([...templates, t]);
      setNewTemplate({ name: '', startTime: '08:00', endTime: '17:00', breakMinutes: 60 });
    }
  }

  async function deleteTemplate(id: number) {
    await fetch(`/api/templates?id=${id}`, { method: 'DELETE' });
    setTemplates(templates.filter((t) => t.id !== id));
  }

  async function saveSchedule() {
    await fetch('/api/schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleA, scheduleB, referenceDate: referenceDate || null }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updateScheduleDay(weekType: 'A' | 'B', index: number, field: string, value: string | number) {
    if (weekType === 'A') {
      const updated = [...scheduleA];
      updated[index] = { ...updated[index], [field]: value };
      setScheduleA(updated);
    } else {
      const updated = [...scheduleB];
      updated[index] = { ...updated[index], [field]: value };
      setScheduleB(updated);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Inställningar</h1>

      {saved && (
        <div className="bg-green-50 text-green-700 p-3 rounded mb-4 text-sm">Inställningarna sparades!</div>
      )}

      {/* Personal info */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Personuppgifter</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Anställd (namn)</label>
            <input
              type="text"
              value={settings.employeeName}
              onChange={(e) => setSettings({ ...settings, employeeName: e.target.value })}
              placeholder="Ditt namn (visas på lönebesked)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Arbetsgivare</label>
            <input
              type="text"
              value={settings.employerName}
              onChange={(e) => setSettings({ ...settings, employerName: e.target.value })}
              placeholder="Företagsnamn (visas på lönebesked)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Salary settings */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Löne- och OB-inställningar</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Arbetsplatstyp</label>
            <select
              value={settings.workplaceType}
              onChange={(e) => setSettings({ ...settings, workplaceType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="none">Ingen OB</option>
              <option value="butik">Butik</option>
              <option value="lager">Lager</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Avtalsnivå</label>
            <select
              value={settings.contractLevel}
              onChange={(e) => setSettings({ ...settings, contractLevel: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {contractOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Skattemetod</label>
            <select
              value={settings.taxMode}
              onChange={(e) => setSettings({ ...settings, taxMode: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="percentage">Procentsats</option>
              <option value="table">Skattetabell (Skatteverket 2026)</option>
            </select>
          </div>
          {settings.taxMode === 'percentage' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Skattesats (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={settings.taxRate}
                onChange={(e) => setSettings({ ...settings, taxRate: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kommun</label>
              <div className="relative">
                <input
                  type="text"
                  value={municipalitySearch}
                  onChange={(e) => {
                    setMunicipalitySearch(e.target.value);
                  }}
                  placeholder="Sök kommun..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {municipalitySearch && !settings.municipality && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {municipalities
                      .filter((m) => m.name.toLowerCase().includes(municipalitySearch.toLowerCase()))
                      .slice(0, 10)
                      .map((m) => (
                        <button
                          key={m.name}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm"
                          onClick={() => {
                            setSettings({ ...settings, municipality: m.name, taxTable: m.tableNumber });
                            setMunicipalitySearch(m.name);
                          }}
                        >
                          {m.name} — {m.taxRate}% (tabell {m.tableNumber})
                        </button>
                      ))}
                  </div>
                )}
              </div>
              {settings.municipality && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-green-700 bg-green-50 px-2 py-1 rounded">
                    Tabell {settings.taxTable} ({settings.municipality})
                  </span>
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => {
                      setSettings({ ...settings, municipality: '', taxTable: null });
                      setMunicipalitySearch('');
                    }}
                  >
                    Rensa
                  </button>
                </div>
              )}
              {!settings.municipality && (
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">Eller ange tabellnummer manuellt (29-42)</label>
                  <input
                    type="number"
                    min="29"
                    max="42"
                    value={settings.taxTable ?? ''}
                    onChange={(e) => setSettings({ ...settings, taxTable: parseInt(e.target.value) || null })}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              )}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Semesterersättning (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={settings.vacationPayRate}
              onChange={(e) => setSettings({ ...settings, vacationPayRate: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Semesterersättning</label>
            <select
              value={settings.vacationPayMode}
              onChange={(e) => setSettings({ ...settings, vacationPayMode: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="included">Inkluderad i timlön</option>
              <option value="separate">Separat ackumulering</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Arbetstimmar/månad</label>
            <input
              type="number"
              value={settings.workingHoursPerMonth}
              onChange={(e) => setSettings({ ...settings, workingHoursPerMonth: parseFloat(e.target.value) || 160 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="autoBreak"
              checked={settings.autoBreakCalc}
              onChange={(e) => setSettings({ ...settings, autoBreakCalc: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="autoBreak" className="text-sm text-gray-700">Automatisk rastberäkning</label>
          </div>
        </div>
      </div>

      {/* Calendar & Default times */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Kalender- och tidspreferenser</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Standardvy (kalender)</label>
            <select
              value={settings.calendarViewDefault}
              onChange={(e) => setSettings({ ...settings, calendarViewDefault: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="week">Vecka</option>
              <option value="month">Månad</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Standard starttid</label>
            <input
              type="time"
              value={settings.defaultStartTime}
              onChange={(e) => setSettings({ ...settings, defaultStartTime: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Standard sluttid</label>
            <input
              type="time"
              value={settings.defaultEndTime}
              onChange={(e) => setSettings({ ...settings, defaultEndTime: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Save all settings */}
      <div className="mb-6">
        <button onClick={saveSettings} className="bg-blue-600 text-white px-6 py-2.5 rounded-md hover:bg-blue-700 font-medium">
          Spara alla inställningar
        </button>
      </div>

      {/* Templates */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Arbetsmallar</h2>
        {templates.length > 0 && (
          <div className="mb-4 space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-3 bg-gray-50 rounded min-w-0 flex-wrap gap-2">
                <span>
                  <strong>{t.name}</strong> — {t.startTime}-{t.endTime} ({t.breakMinutes}m rast)
                </span>
                <button onClick={() => deleteTemplate(t.id)} className="text-red-600 hover:underline text-sm">
                  Ta bort
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Namn</label>
            <input
              type="text"
              value={newTemplate.name}
              onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
              placeholder="T.ex. Morgonpass"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Start</label>
            <input
              type="time"
              value={newTemplate.startTime}
              onChange={(e) => setNewTemplate({ ...newTemplate, startTime: e.target.value })}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Slut</label>
            <input
              type="time"
              value={newTemplate.endTime}
              onChange={(e) => setNewTemplate({ ...newTemplate, endTime: e.target.value })}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rast (min)</label>
            <input
              type="number"
              value={newTemplate.breakMinutes}
              onChange={(e) => setNewTemplate({ ...newTemplate, breakMinutes: parseInt(e.target.value) || 0 })}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <button onClick={addTemplate} className="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700">
            Lägg till
          </button>
        </div>
      </div>

      {/* Weekly schedule */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Veckoschema</h2>
        <p className="text-sm text-gray-500 mb-4">Ställ in standardtider per veckodag. Stöd för roterande A/B-schema.</p>

        {/* Referensvecka */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-sm font-medium text-blue-800 mb-1">Referensdatum (Vecka A börjar)</label>
              <DatePicker
                value={referenceDate}
                onChange={setReferenceDate}
                className="px-2 py-1.5 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {referenceDate && (
              <>
                <div className="flex items-center gap-2 mt-4">
                  <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">A/B-rotation aktiverad</span>
                  <button
                    type="button"
                    onClick={() => { setReferenceDate(''); setActiveScheduleTab('A'); }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Rensa
                  </button>
                </div>
              </>
            )}
          </div>
          {!referenceDate && (
            <p className="text-xs text-blue-600 mt-2">Ange ett referensdatum för att aktivera A/B-rotation. Utan referensdatum används alltid Vecka A.</p>
          )}
        </div>

        {/* A/B-flikar */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setActiveScheduleTab('A')}
            className={`px-4 py-2 rounded-t-md text-sm font-medium border-b-2 transition-colors ${
              activeScheduleTab === 'A'
                ? 'border-blue-600 text-blue-700 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Vecka A
          </button>
          <button
            type="button"
            onClick={() => referenceDate && setActiveScheduleTab('B')}
            disabled={!referenceDate}
            title={!referenceDate ? 'Ange referensdatum för att aktivera Vecka B' : ''}
            className={`px-4 py-2 rounded-t-md text-sm font-medium border-b-2 transition-colors ${
              activeScheduleTab === 'B'
                ? 'border-purple-600 text-purple-700 bg-purple-50'
                : referenceDate
                  ? 'border-transparent text-gray-500 hover:text-gray-700'
                  : 'border-transparent text-gray-300 cursor-not-allowed'
            }`}
          >
            Vecka B{!referenceDate && <span className="ml-1 text-xs">(ange referensdatum)</span>}
          </button>
        </div>

        {/* Schema-grid */}
        {(() => {
          const currentSchedule = activeScheduleTab === 'A' ? scheduleA : scheduleB;
          return (
            <div className="space-y-2">
              {currentSchedule.map((day, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                  <span className="text-sm font-medium">{dayNames[i]}</span>
                  <input
                    type="time"
                    value={day.startTime}
                    onChange={(e) => updateScheduleDay(activeScheduleTab, i, 'startTime', e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                    placeholder="Start"
                  />
                  <input
                    type="time"
                    value={day.endTime}
                    onChange={(e) => updateScheduleDay(activeScheduleTab, i, 'endTime', e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                    placeholder="Slut"
                  />
                  <input
                    type="number"
                    value={day.breakMinutes || ''}
                    onChange={(e) => updateScheduleDay(activeScheduleTab, i, 'breakMinutes', parseInt(e.target.value) || 0)}
                    placeholder="Rast (min)"
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                  />
                </div>
              ))}
            </div>
          );
        })()}

        <button onClick={saveSchedule} className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
          Spara veckoschema
        </button>

        {/* Månadspreview — visas bara om referenceDate är satt */}
        {referenceDate && (
          <ScheduleMonthPreview
            referenceDate={referenceDate}
            scheduleA={scheduleA}
            scheduleB={scheduleB}
          />
        )}
      </div>
    </div>
  );
}
