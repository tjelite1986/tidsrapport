'use client';

import { useEffect, useState } from 'react';
import { getWeekType } from '@/lib/calculations/time-utils';
import DatePicker from '@/components/DatePicker';
import TimePicker from '@/components/TimePicker';
import TimeEntryDetailsDialog from '@/components/dialogs/TimeEntryDetailsDialog';
import EditTimeEntryDialog from '@/components/dialogs/EditTimeEntryDialog';
import CalendarWeekView from '@/components/calendar/CalendarWeekView';
import CalendarMonthView from '@/components/calendar/CalendarMonthView';
import CalendarViewToggle from '@/components/calendar/CalendarViewToggle';
import TaskSegmentEditor from '@/components/TaskSegmentEditor';
import ScheduleImportDialog from '@/components/dialogs/ScheduleImportDialog';
import { TaskSegment, parseTaskSegments, serializeTaskSegments } from '@/lib/types/segments';
import { BreakPeriod, sumBreakMinutes, serializeBreakPeriods } from '@/lib/types/break-periods';
import { BreakRule } from '@/lib/calculations';

interface Project {
  id: number;
  name: string;
  active: boolean;
}

interface TimeEntry {
  id: number;
  projectId: number;
  projectName: string;
  date: string;
  hours: number;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number | null;
  breakPeriods?: BreakPeriod[] | null;
  entryType: string;
  overtimeType: string;
  description: string | null;
  taskSegments: string | null;
}

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

function getWeekDates(offset: number = 0): { start: string; end: string; dates: string[] } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  return { start: dates[0], end: dates[6], dates };
}

const dayNames = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

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

function autoBreakCalc(startTime: string, endTime: string, rules?: BreakRule[]): number {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;
  if (endMinutes <= startMinutes) endMinutes += 1440;
  const hours = (endMinutes - startMinutes) / 60;
  if (rules && rules.length > 0) {
    const sorted = [...rules].sort((a, b) => b.minHours - a.minHours);
    const match = sorted.find((r) => hours >= r.minHours);
    return match ? match.breakMinutes : 0;
  }
  if (hours >= 8) return 60;
  if (hours >= 6) return 30;
  if (hours >= 4) return 15;
  return 0;
}

function generateBreakPeriod(startTime: string, endTime: string, breakMins: number, date?: string): BreakPeriod {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let startTotal = sh * 60 + sm;
  let endTotal = eh * 60 + em;
  if (endTotal <= startTotal) endTotal += 1440;

  // Om lördag och skiftet korsar 12:00-gränsen (OB-gräns för butik):
  // placera rasten så nära före 12:00 som möjligt (vanlig tid = lägre lönekostnad)
  const obBoundary = 720; // 12:00 i minuter
  if (date) {
    const d = new Date(date + 'T12:00:00');
    const isSaturday = d.getDay() === 6;
    if (isSaturday && startTotal < obBoundary && endTotal > obBoundary + breakMins) {
      // Lägg rasten så att den slutar precis vid (eller strax före) 12:00
      const beMin = Math.min(obBoundary, endTotal - breakMins);
      const bsMin = beMin - breakMins;
      if (bsMin >= startTotal) {
        const bsNorm = ((bsMin % 1440) + 1440) % 1440;
        const beNorm = ((beMin % 1440) + 1440) % 1440;
        return {
          start: `${String(Math.floor(bsNorm / 60)).padStart(2, '0')}:${String(bsNorm % 60).padStart(2, '0')}`,
          end: `${String(Math.floor(beNorm / 60)).padStart(2, '0')}:${String(beNorm % 60).padStart(2, '0')}`,
        };
      }
    }
  }

  // Standard: mittpunkt
  const midpoint = Math.floor((startTotal + endTotal) / 2);
  const bsMin = midpoint - Math.floor(breakMins / 2);
  const beMin = bsMin + breakMins;
  const bsNorm = ((bsMin % 1440) + 1440) % 1440;
  const beNorm = ((beMin % 1440) + 1440) % 1440;
  return {
    start: `${String(Math.floor(bsNorm / 60)).padStart(2, '0')}:${String(bsNorm % 60).padStart(2, '0')}`,
    end: `${String(Math.floor(beNorm / 60)).padStart(2, '0')}:${String(beNorm % 60).padStart(2, '0')}`,
  };
}

export default function TidPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [scheduleA, setScheduleA] = useState<ScheduleEntry[]>([]);
  const [scheduleB, setScheduleB] = useState<ScheduleEntry[]>([]);
  const [scheduleC, setScheduleC] = useState<ScheduleEntry[]>([]);
  const [scheduleD, setScheduleD] = useState<ScheduleEntry[]>([]);
  const [referenceDate, setReferenceDate] = useState<string | null>(null);
  const [weekCount, setWeekCount] = useState<2 | 4>(2);
  const [weekOffset, setWeekOffset] = useState(0);
  const [refillTrigger, setRefillTrigger] = useState(0);
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [breakPeriods, setBreakPeriods] = useState<BreakPeriod[]>([]);
  const [autoBreakEnabled, setAutoBreakEnabled] = useState(true);
  const [autoBreakRules, setAutoBreakRules] = useState<BreakRule[]>([]);
  const [entryType, setEntryType] = useState('work');
  const [overtimeType, setOvertimeType] = useState('none');
  const [description, setDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [departments, setDepartments] = useState<string[]>([]);
  const [taskSegments, setTaskSegments] = useState<TaskSegment[]>([]);

  // Calendar view
  const [calendarView, setCalendarView] = useState<'week' | 'month'>('month');
  const [monthYear, setMonthYear] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const [calendarEntries, setCalendarEntries] = useState<any[]>([]);

  // Dialog states
  const [detailEntry, setDetailEntry] = useState<TimeEntry | null>(null);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [scheduleImportOpen, setScheduleImportOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const week = getWeekDates(weekOffset);

  useEffect(() => {
    fetch('/api/projects').then((r) => r.json()).then(setProjects);
    fetch('/api/templates').then((r) => r.json()).then(setTemplates);
    fetch('/api/schedule').then((r) => r.json()).then((data) => {
      setScheduleA(data.scheduleA || []);
      setScheduleB(data.scheduleB || []);
      setScheduleC(data.scheduleC || []);
      setScheduleD(data.scheduleD || []);
      setReferenceDate(data.referenceDate || null);
      setWeekCount(data.weekCount === 4 ? 4 : 2);
    });
    fetch('/api/settings').then((r) => r.json()).then((s: any) => {
      if (s.autoBreakCalc !== undefined) setAutoBreakEnabled(s.autoBreakCalc);
      try { setDepartments(JSON.parse(s.departments || '[]')); } catch { setDepartments([]); }
      try { setAutoBreakRules(JSON.parse(s.autoBreakRules || '[]')); } catch { setAutoBreakRules([]); }
    });
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [weekOffset]);

  async function fetchEntries() {
    const res = await fetch(`/api/time-entries?startDate=${week.start}&endDate=${week.end}`);
    setEntries(await res.json());
  }

  async function fetchCalendarEntries() {
    const start = `${monthYear.year}-${String(monthYear.month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(monthYear.year, monthYear.month + 1, 0).getDate();
    const end = `${monthYear.year}-${String(monthYear.month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    fetch(`/api/calendar-data?startDate=${start}&endDate=${end}`)
      .then((r) => r.json())
      .then((data) => setCalendarEntries(data.entries || []))
      .catch(() => setCalendarEntries([]));
  }

  async function refreshAll() {
    await fetchEntries();
    await fetchCalendarEntries();
  }

  // Fetch calendar data with pay info for month view
  useEffect(() => {
    if (calendarView === 'month') {
      fetchCalendarEntries();
    }
  }, [calendarView, monthYear]);

  // Auto-fill from schedule when date changes or after form reset
  useEffect(() => {
    if (!date || scheduleA.length === 0) return;
    if (referenceDate && date < referenceDate) return; // Ingen auto-fill före schemat startar
    const d = new Date(date + 'T12:00:00');
    const jsDay = d.getDay();
    const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
    const allSchedules = { A: scheduleA, B: scheduleB, C: scheduleC, D: scheduleD };
    const wt = referenceDate ? getWeekType(date, referenceDate, weekCount) : 'A';
    const activeSchedule = allSchedules[wt];
    const schedEntry = activeSchedule.find((s) => s.dayOfWeek === dayOfWeek);
    if (schedEntry && schedEntry.startTime && !startTime && !endTime) {
      setStartTime(schedEntry.startTime);
      setEndTime(schedEntry.endTime);
      // If auto is off, set break from schedule; if auto is on, the auto-break effect handles it
      if (!autoBreakEnabled) {
        if (schedEntry.breakMinutes > 0) {
          setBreakPeriods([generateBreakPeriod(schedEntry.startTime, schedEntry.endTime, schedEntry.breakMinutes, date)]);
        } else {
          setBreakPeriods([]);
        }
      }
    }
  }, [date, scheduleA, scheduleB, scheduleC, scheduleD, referenceDate, weekCount, refillTrigger]);

  // Auto-calculate break when times change (or when auto mode is toggled on)
  useEffect(() => {
    if (!autoBreakEnabled) return;
    if (!startTime || !endTime) {
      setBreakPeriods([]);
      return;
    }
    const mins = autoBreakCalc(startTime, endTime, autoBreakRules.length > 0 ? autoBreakRules : undefined);
    if (mins === 0) {
      setBreakPeriods([]);
      return;
    }
    setBreakPeriods([generateBreakPeriod(startTime, endTime, mins, date)]);
  }, [startTime, endTime, autoBreakEnabled, autoBreakRules, date]);

  function applyTemplate(templateId: string) {
    setSelectedTemplate(templateId);
    const tmpl = templates.find((t) => t.id === parseInt(templateId));
    if (tmpl) {
      setStartTime(tmpl.startTime);
      setEndTime(tmpl.endTime);
      // Auto-break effect handles it if auto is on; else set from template
      if (!autoBreakEnabled) {
        if (tmpl.breakMinutes > 0) {
          setBreakPeriods([generateBreakPeriod(tmpl.startTime, tmpl.endTime, tmpl.breakMinutes, date)]);
        } else {
          setBreakPeriods([]);
        }
      }
    }
  }

  // Slå upp schema för ett givet datum (returnerar null om inget schema eller före referensdatum)
  function getScheduleForDate(dateStr: string): { startTime: string; endTime: string; breakMinutes: number } | null {
    if (scheduleA.length === 0 || !referenceDate || dateStr < referenceDate) return null;
    const d = new Date(dateStr + 'T12:00:00');
    const jsDay = d.getDay();
    const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
    const allSchedules = { A: scheduleA, B: scheduleB, C: scheduleC, D: scheduleD };
    const wt = getWeekType(dateStr, referenceDate, weekCount);
    const entry = allSchedules[wt].find((s) => s.dayOfWeek === dayOfWeek && s.startTime);
    return entry ? { startTime: entry.startTime, endTime: entry.endTime, breakMinutes: entry.breakMinutes } : null;
  }

  // Förifyll formuläret med schema för ett datum (vid klick på schemalagd dag i kalender)
  function applyScheduleForDate(dateStr: string) {
    const sched = getScheduleForDate(dateStr);
    setDate(dateStr);
    if (sched) {
      setStartTime(sched.startTime);
      setEndTime(sched.endTime);
      if (!autoBreakEnabled) {
        if (sched.breakMinutes > 0) {
          setBreakPeriods([generateBreakPeriod(sched.startTime, sched.endTime, sched.breakMinutes, dateStr)]);
        } else {
          setBreakPeriods([]);
        }
      }
      // Auto-break effect fires when startTime/endTime are updated if autoBreakEnabled
    } else {
      setStartTime('');
      setEndTime('');
      setBreakPeriods([]);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const totalBreakMinutes = sumBreakMinutes(breakPeriods);
  const previewHours = calcHoursPreview(startTime, endTime, totalBreakMinutes);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');
    const validPeriods = breakPeriods.filter((bp) => bp.start && bp.end);
    const res = await fetch('/api/time-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: parseInt(projectId),
        date,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        ...(validPeriods.length > 0
          ? { breakPeriods: validPeriods }
          : { breakMinutes: startTime && endTime ? 0 : undefined }),
        entryType,
        overtimeType,
        description,
        taskSegments: serializeTaskSegments(taskSegments),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setSubmitError(err.error || 'Kunde inte spara tidsregistrering');
      return;
    }
    setStartTime('');
    setEndTime('');
    setBreakPeriods([]);
    setDescription('');
    setSelectedTemplate('');
    setOvertimeType('none');
    setEntryType('work');
    setTaskSegments([]);
    setRefillTrigger((t) => t + 1); // Triggar om schema-auto-fill för nästa post
    refreshAll();
  }

  async function handleDelete(id: number) {
    await fetch(`/api/time-entries?id=${id}`, { method: 'DELETE' });
    refreshAll();
  }

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Tidsregistrering</h1>

      <form onSubmit={handleSubmit} className="bg-white p-4 sm:p-6 rounded-lg shadow mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Logga tid</h2>
          <button
            type="button"
            onClick={() => setScheduleImportOpen(true)}
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            Importera schema
          </button>
        </div>

        {templates.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Mall</label>
            <select
              value={selectedTemplate}
              onChange={(e) => applyTemplate(e.target.value)}
              className="w-full md:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Välj mall...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.startTime}-{t.endTime})</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Projekt</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Välj projekt</option>
              {projects.filter((p) => p.active).map((p) => (
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Starttid</label>
            <TimePicker
              value={startTime}
              onChange={setStartTime}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sluttid</label>
            <TimePicker
              value={endTime}
              onChange={setEndTime}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Raster
              <span className="ml-2 inline-flex rounded overflow-hidden border border-gray-200 text-xs align-middle">
                <button type="button"
                  onClick={() => setAutoBreakEnabled(true)}
                  className={`px-2 py-1 transition-colors ${autoBreakEnabled ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  Auto
                </button>
                <button type="button"
                  onClick={() => setAutoBreakEnabled(false)}
                  className={`px-2 py-1 transition-colors border-l border-gray-200 ${!autoBreakEnabled ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  Manuell
                </button>
              </span>
            </label>
            <div className="space-y-1">
              {breakPeriods.map((bp, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <TimePicker
                    value={bp.start}
                    onChange={(v) => {
                      setAutoBreakEnabled(false);
                      setBreakPeriods((prev) => prev.map((p, i) => i === idx ? { ...p, start: v } : p));
                    }}
                    placeholder="Start"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <span className="text-gray-400 text-sm">–</span>
                  <TimePicker
                    value={bp.end}
                    onChange={(v) => {
                      setAutoBreakEnabled(false);
                      setBreakPeriods((prev) => prev.map((p, i) => i === idx ? { ...p, end: v } : p));
                    }}
                    placeholder="Slut"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => { setAutoBreakEnabled(false); setBreakPeriods((prev) => prev.filter((_, i) => i !== idx)); }}
                    className="text-red-500 hover:text-red-700 text-xs px-1 flex-shrink-0"
                  >
                    Ta bort
                  </button>
                </div>
              ))}
              {breakPeriods.length === 0 && (
                <p className="text-xs text-gray-400">Ingen rast</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setAutoBreakEnabled(false); setBreakPeriods((prev) => [...prev, { start: '', end: '' }]); }}
              className="mt-1 text-xs text-blue-600 hover:underline"
            >
              + Lägg till rast
            </button>
            {totalBreakMinutes > 0 && (
              <p className="text-xs text-gray-500 mt-1">Totalt: {totalBreakMinutes} min</p>
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
        </div>

        <TaskSegmentEditor
          segments={taskSegments}
          onChange={setTaskSegments}
          departments={departments}
          passStart={startTime}
          passEnd={endTime}
        />

        <div className="mt-4 flex items-center gap-4">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
            Spara
          </button>
          {previewHours && (
            <span className="text-sm text-gray-600">
              Beräknade timmar: <strong className="text-blue-600">{previewHours}h</strong>
            </span>
          )}
        </div>
        {submitError && (
          <p className="mt-2 text-sm text-red-600">{submitError}</p>
        )}
      </form>

      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Kalender</h2>
          <CalendarViewToggle view={calendarView} onChange={setCalendarView} />
        </div>

        {calendarView === 'week' ? (
          <CalendarWeekView
            weekOffset={weekOffset}
            entries={entries}
            onDayClick={(clickedDate, dayEntries) => {
              if (dayEntries.length === 1) {
                setDetailEntry(dayEntries[0] as any);
              } else if (dayEntries.length === 0) {
                applyScheduleForDate(clickedDate);
              }
            }}
            onEntryClick={(e) => setDetailEntry(e as any)}
            onPrev={() => setWeekOffset(weekOffset - 1)}
            onNext={() => setWeekOffset(weekOffset + 1)}
            scheduleA={scheduleA}
            scheduleB={scheduleB}
            scheduleC={scheduleC}
            scheduleD={scheduleD}
            referenceDate={referenceDate}
            weekCount={weekCount}
          />
        ) : (
          <CalendarMonthView
            year={monthYear.year}
            month={monthYear.month}
            entries={calendarEntries}
            onDayClick={(clickedDate, dayEntries) => {
              if (dayEntries.length === 1) {
                setDetailEntry(dayEntries[0] as any);
              } else if (dayEntries.length === 0) {
                applyScheduleForDate(clickedDate);
              }
            }}
            onEntryClick={(e) => setDetailEntry(e as any)}
            onPrev={() => {
              setMonthYear((prev) => {
                const m = prev.month - 1;
                return m < 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: m };
              });
            }}
            onNext={() => {
              setMonthYear((prev) => {
                const m = prev.month + 1;
                return m > 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: m };
              });
            }}
            scheduleA={scheduleA}
            scheduleB={scheduleB}
            scheduleC={scheduleC}
            scheduleD={scheduleD}
            referenceDate={referenceDate}
            weekCount={weekCount}
          />
        )}

        <div className="overflow-x-auto mt-6">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Projekt</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tid</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Timmar</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Typ</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Beskrivning</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetailEntry(entry)}>
                  <td className="px-4 py-2">{entry.date}</td>
                  <td className="px-4 py-2">{entry.projectName}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">
                    {entry.startTime && entry.endTime
                      ? `${entry.startTime}-${entry.endTime}`
                      : '-'}
                    {entry.breakPeriods && entry.breakPeriods.length > 0
                      ? ` (${sumBreakMinutes(entry.breakPeriods)}m rast)`
                      : entry.breakMinutes ? ` (${entry.breakMinutes}m rast)` : ''}
                  </td>
                  <td className="px-4 py-2">{entry.hours.toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      entry.entryType === 'sick' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {entry.entryType === 'sick' ? 'Sjuk' : 'Arbete'}
                    </span>
                    {entry.overtimeType !== 'none' && (
                      <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                        {entry.overtimeType === 'mertid' ? 'Mertid' :
                         entry.overtimeType === 'enkel' ? 'Enkel ÖT' : 'Kval ÖT'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{entry.description || '-'}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setEditEntry(entry)}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Redigera
                      </button>
                      <button onClick={() => handleDelete(entry.id)} className="text-red-600 hover:underline text-sm">
                        Ta bort
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {entries.length === 0 && (
          <p className="text-center text-gray-500 py-4">Inga tidsregistreringar denna vecka.</p>
        )}
      </div>

      {/* Dialogs */}
      <TimeEntryDetailsDialog
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
        onEdit={(e) => { setDetailEntry(null); setEditEntry(e); }}
        onDelete={async (id) => {
          await fetch(`/api/time-entries?id=${id}`, { method: 'DELETE' });
          setDetailEntry(null);
          refreshAll();
        }}
      />
      <EditTimeEntryDialog
        entry={editEntry}
        projects={projects}
        departments={departments}
        onClose={() => setEditEntry(null)}
        onSaved={refreshAll}
      />
      <ScheduleImportDialog
        open={scheduleImportOpen}
        projects={projects}
        onClose={() => setScheduleImportOpen(false)}
        onImported={refreshAll}
      />
    </div>
  );
}
