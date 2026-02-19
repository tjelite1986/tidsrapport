'use client';

import { useEffect, useState } from 'react';
import { getWeekType } from '@/lib/calculations/time-utils';
import DatePicker from '@/components/DatePicker';
import TimePicker from '@/components/TimePicker';

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

const WEEK_COLORS: Record<'A' | 'B' | 'C' | 'D', { bg: string; border: string; text: string; badge: string }> = {
  A: { bg: 'bg-blue-100',   border: 'border-blue-300',   text: 'text-blue-700',   badge: 'bg-blue-300 border-blue-400' },
  B: { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-700', badge: 'bg-purple-300 border-purple-400' },
  C: { bg: 'bg-teal-100',   border: 'border-teal-300',   text: 'text-teal-700',   badge: 'bg-teal-300 border-teal-400' },
  D: { bg: 'bg-amber-100',  border: 'border-amber-300',  text: 'text-amber-700',  badge: 'bg-amber-300 border-amber-400' },
};

function ScheduleMonthPreview({
  referenceDate,
  scheduleA,
  scheduleB,
  scheduleC,
  scheduleD,
  weekCount,
}: {
  referenceDate: string;
  scheduleA: ScheduleEntry[];
  scheduleB: ScheduleEntry[];
  scheduleC: ScheduleEntry[];
  scheduleD: ScheduleEntry[];
  weekCount: 2 | 4;
}) {
  const [previewDate, setPreviewDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const { year, month } = previewDate;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const firstWeekday = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

  const schedules = { A: scheduleA, B: scheduleB, C: scheduleC, D: scheduleD };

  const days: { date: string; weekType: 'A' | 'B' | 'C' | 'D'; entry: ScheduleEntry | null }[] = [];
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const wt = getWeekType(dateStr, referenceDate, weekCount);
    const jsDay = new Date(dateStr + 'T12:00:00').getDay();
    const dow = jsDay === 0 ? 6 : jsDay - 1;
    const entry = schedules[wt].find((s) => s.dayOfWeek === dow) || null;
    days.push({ date: dateStr, weekType: wt, entry: entry && entry.startTime ? entry : null });
  }

  const visibleWeeks = weekCount === 4 ? (['A', 'B', 'C', 'D'] as const) : (['A', 'B'] as const);

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

      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Mån','Tis','Ons','Tor','Fre','Lör','Sön'].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstWeekday }, (_, i) => <div key={`empty-${i}`} />)}
        {days.map(({ date, weekType, entry }) => {
          const dayNum = parseInt(date.split('-')[2]);
          const c = WEEK_COLORS[weekType];
          return (
            <div
              key={date}
              className={`rounded p-1 text-center min-h-[52px] flex flex-col items-center justify-start border ${c.bg} ${c.border}`}
            >
              <div className="flex items-center gap-0.5">
                <span className="text-xs font-medium text-gray-700">{dayNum}</span>
                <span className={`text-xs font-bold ${c.text}`}>{weekType}</span>
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

      <div className="flex flex-wrap gap-3 mt-3">
        {visibleWeeks.map((w) => (
          <div key={w} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded border ${WEEK_COLORS[w].badge}`} />
            <span className="text-xs text-gray-600">Vecka {w}</span>
          </div>
        ))}
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
  const [scheduleC, setScheduleC] = useState<ScheduleEntry[]>(emptyWeek());
  const [scheduleD, setScheduleD] = useState<ScheduleEntry[]>(emptyWeek());
  const [referenceDate, setReferenceDate] = useState<string>('');
  const [weekCount, setWeekCount] = useState<2 | 4>(2);
  const [activeScheduleTab, setActiveScheduleTab] = useState<'A' | 'B' | 'C' | 'D'>('A');

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
      setScheduleC(data.scheduleC || emptyWeek());
      setScheduleD(data.scheduleD || emptyWeek());
      setReferenceDate(data.referenceDate || '');
      setWeekCount(data.weekCount === 4 ? 4 : 2);
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
      body: JSON.stringify({ scheduleA, scheduleB, scheduleC, scheduleD, referenceDate: referenceDate || null, weekCount }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updateScheduleDay(weekType: 'A' | 'B' | 'C' | 'D', index: number, field: string, value: string | number) {
    const setters = { A: setScheduleA, B: setScheduleB, C: setScheduleC, D: setScheduleD };
    const current = { A: scheduleA, B: scheduleB, C: scheduleC, D: scheduleD }[weekType];
    const updated = [...current];
    updated[index] = { ...updated[index], [field]: value };
    setters[weekType](updated);
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
            <TimePicker
              value={settings.defaultStartTime}
              onChange={(v) => setSettings({ ...settings, defaultStartTime: v })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Standard sluttid</label>
            <TimePicker
              value={settings.defaultEndTime}
              onChange={(v) => setSettings({ ...settings, defaultEndTime: v })}
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
            <TimePicker
              value={newTemplate.startTime}
              onChange={(v) => setNewTemplate({ ...newTemplate, startTime: v })}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Slut</label>
            <TimePicker
              value={newTemplate.endTime}
              onChange={(v) => setNewTemplate({ ...newTemplate, endTime: v })}
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

        {/* Referensvecka + rotationslängd */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="block text-sm font-medium text-blue-800 mb-1">Referensdatum (Vecka A börjar)</label>
              <DatePicker
                value={referenceDate}
                onChange={setReferenceDate}
                className="px-2 py-1.5 border border-blue-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-800 mb-1">Rotationslängd</label>
              <div className="flex rounded overflow-hidden border border-blue-300">
                <button
                  type="button"
                  onClick={() => { setWeekCount(2); if (['C','D'].includes(activeScheduleTab)) setActiveScheduleTab('A'); }}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${weekCount === 2 ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 hover:bg-blue-100'}`}
                >
                  2 veckor (A/B)
                </button>
                <button
                  type="button"
                  onClick={() => setWeekCount(4)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${weekCount === 4 ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 hover:bg-blue-100'}`}
                >
                  4 veckor (A/B/C/D)
                </button>
              </div>
            </div>
            {referenceDate && (
              <div className="flex items-center gap-2 mt-3 self-end">
                <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">Rotation aktiverad</span>
                <button
                  type="button"
                  onClick={() => { setReferenceDate(''); setActiveScheduleTab('A'); }}
                  className="text-xs text-red-600 hover:underline"
                >
                  Rensa
                </button>
              </div>
            )}
          </div>
          {!referenceDate && (
            <p className="text-xs text-blue-600 mt-2">Ange ett referensdatum för att aktivera roterande schema. Utan referensdatum används alltid Vecka A.</p>
          )}
        </div>

        {/* Veckoflikar */}
        {(() => {
          const tabs: { key: 'A' | 'B' | 'C' | 'D'; activeBorder: string; activeBg: string; activeText: string }[] = [
            { key: 'A', activeBorder: 'border-blue-600',   activeBg: 'bg-blue-50',   activeText: 'text-blue-700' },
            { key: 'B', activeBorder: 'border-purple-600', activeBg: 'bg-purple-50', activeText: 'text-purple-700' },
            { key: 'C', activeBorder: 'border-teal-600',   activeBg: 'bg-teal-50',   activeText: 'text-teal-700' },
            { key: 'D', activeBorder: 'border-amber-600',  activeBg: 'bg-amber-50',  activeText: 'text-amber-700' },
          ];
          const visibleTabs = weekCount === 4 ? tabs : tabs.slice(0, 2);
          return (
            <div className="flex gap-2 mb-4">
              {visibleTabs.map(({ key, activeBorder, activeBg, activeText }) => {
                const isActive = activeScheduleTab === key;
                const isDisabled = !referenceDate && key !== 'A';
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => !isDisabled && setActiveScheduleTab(key)}
                    disabled={isDisabled}
                    title={isDisabled ? 'Ange referensdatum för att aktivera' : ''}
                    className={`px-4 py-2 rounded-t-md text-sm font-medium border-b-2 transition-colors ${
                      isActive
                        ? `${activeBorder} ${activeText} ${activeBg}`
                        : isDisabled
                        ? 'border-transparent text-gray-300 cursor-not-allowed'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Vecka {key}
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Schema-grid */}
        {(() => {
          const schedules = { A: scheduleA, B: scheduleB, C: scheduleC, D: scheduleD };
          const currentSchedule = schedules[activeScheduleTab];
          return (
            <div className="space-y-2">
              {currentSchedule.map((day, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                  <span className="text-sm font-medium">{dayNames[i]}</span>
                  <TimePicker
                    value={day.startTime}
                    onChange={(v) => updateScheduleDay(activeScheduleTab, i, 'startTime', v)}
                    placeholder="Start"
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                  />
                  <TimePicker
                    value={day.endTime}
                    onChange={(v) => updateScheduleDay(activeScheduleTab, i, 'endTime', v)}
                    placeholder="Slut"
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm"
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

        {referenceDate && (
          <ScheduleMonthPreview
            referenceDate={referenceDate}
            scheduleA={scheduleA}
            scheduleB={scheduleB}
            scheduleC={scheduleC}
            scheduleD={scheduleD}
            weekCount={weekCount}
          />
        )}
      </div>
    </div>
  );
}
