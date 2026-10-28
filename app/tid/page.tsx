'use client';

import { useEffect, useRef, useState } from 'react';
import { getWeekType } from '@/lib/calculations/time-utils';
import DatePicker from '@/components/DatePicker';
import TimePicker, { TimePickerHandle } from '@/components/TimePicker';
import TimeEntryDetailsDialog from '@/components/dialogs/TimeEntryDetailsDialog';
import EditTimeEntryDialog from '@/components/dialogs/EditTimeEntryDialog';
import CalendarWeekView from '@/components/calendar/CalendarWeekView';
import CalendarMonthView from '@/components/calendar/CalendarMonthView';
import CalendarViewToggle from '@/components/calendar/CalendarViewToggle';
import TaskSegmentEditor from '@/components/TaskSegmentEditor';
import PageHeader from '@/components/ui/PageHeader';
import ScheduleImportDialog from '@/components/dialogs/ScheduleImportDialog';
import CalendarEventDialog, { CalendarEventDraft } from '@/components/dialogs/CalendarEventDialog';
import { TaskSegment, parseTaskSegments, serializeTaskSegments } from '@/lib/types/segments';
import { BreakPeriod, sumBreakMinutes, serializeBreakPeriods } from '@/lib/types/break-periods';
import { BreakRule, generateBreakPeriod } from '@/lib/calculations';

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
  hourlyRateOverride?: number | null;
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
    // Local date components — toISOString shifts the week around midnight (UTC)
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }

  return { start: dates[0], end: dates[6], dates };
}

const dayNames = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

function weekdayShort(dateStr: string): string {
  const jsDay = new Date(dateStr + 'T12:00:00').getDay();
  return dayNames[jsDay === 0 ? 6 : jsDay - 1];
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
  const [manualHours, setManualHours] = useState('');
  const [overtimeType, setOvertimeType] = useState('none');
  const [rateOverride, setRateOverride] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [departments, setDepartments] = useState<string[]>([]);
  const [taskSegments, setTaskSegments] = useState<TaskSegment[]>([]);

  // Calendar view
  const [calendarView, setCalendarView] = useState<'week' | 'month'>('month');
  const [monthYear, setMonthYear] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const [calendarEntries, setCalendarEntries] = useState<any[]>([]);
  const [calendarVacationDays, setCalendarVacationDays] = useState<{ date: string; dailyPay: number; note: string | null }[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<(CalendarEventDraft & { id: number })[]>([]);

  // Dialog states
  const [detailEntry, setDetailEntry] = useState<TimeEntry | null>(null);
  // Work entries on a vacation day, across all dates — the week view only shows one week
  const [vacationConflicts, setVacationConflicts] = useState<TimeEntry[]>([]);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [scheduleImportOpen, setScheduleImportOpen] = useState(false);
  const [eventDraft, setEventDraft] = useState<CalendarEventDraft | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [defaultTimes, setDefaultTimes] = useState<{ start: string; end: string } | null>(null);

  const week = getWeekDates(weekOffset);

  // /tid?date=YYYY-MM-DD (the "Visa tider" link on a notice): open the calendar on that day and point it out
  const [highlightDate, setHighlightDate] = useState<string | null>(null);
  const scrolledView = useRef<string | null>(null);
  const endTimePicker = useRef<TimePickerHandle>(null);
  const breakEndPickers = useRef<(TimePickerHandle | null)[]>([]);
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get('date');
    if (!target || !/^\d{4}-\d{2}-\d{2}$/.test(target)) return;
    const [y, m, d] = target.split('-').map(Number);
    const day = new Date(y, m - 1, d);
    if (day.getMonth() !== m - 1) return;
    const monday = (x: Date) => {
      const r = new Date(x.getFullYear(), x.getMonth(), x.getDate());
      r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
      return r;
    };
    // Round: a DST change makes the gap between two Mondays an hour off a whole number of days
    setWeekOffset(Math.round((monday(day).getTime() - monday(new Date()).getTime()) / (7 * 86_400_000)));
    setMonthYear({ year: y, month: m - 1 });
    setHighlightDate(target);
  }, []);
  useEffect(() => {
    if (!highlightDate || scrolledView.current === calendarView) return;
    // Wait a frame so the view has rendered the day
    const timer = setTimeout(() => {
      const el = document.getElementById(`cal-day-${highlightDate}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      scrolledView.current = calendarView;
    }, 150);
    return () => clearTimeout(timer);
  }, [highlightDate, calendarView, weekOffset, monthYear]);

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
      if (s.calendarViewDefault === 'week' || s.calendarViewDefault === 'month') {
        setCalendarView(s.calendarViewDefault);
      }
      if (s.defaultStartTime && s.defaultEndTime) {
        setDefaultTimes({ start: s.defaultStartTime, end: s.defaultEndTime });
      }
    });
  }, []);

  useEffect(() => {
    fetchEntries();
    if (calendarView === 'week') {
      fetch(`/api/calendar-data?startDate=${week.start}&endDate=${week.end}`)
        .then((r) => r.json())
        .then((data) => setCalendarVacationDays(data.vacationDays || []))
        .catch(() => {});
    }
  }, [weekOffset, calendarView]);

  async function fetchEntries() {
    const res = await fetch(`/api/time-entries?startDate=${week.start}&endDate=${week.end}`);
    setEntries(await res.json());
    fetch('/api/time-entries/vacation-conflicts')
      .then((r) => (r.ok ? r.json() : []))
      .then(setVacationConflicts)
      .catch(() => {});
  }

  async function fetchCalendarEntries() {
    const start = `${monthYear.year}-${String(monthYear.month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(monthYear.year, monthYear.month + 1, 0).getDate();
    const end = `${monthYear.year}-${String(monthYear.month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    fetch(`/api/calendar-data?startDate=${start}&endDate=${end}`)
      .then((r) => r.json())
      .then((data) => {
        setCalendarEntries(data.entries || []);
        setCalendarVacationDays(data.vacationDays || []);
      })
      .catch(() => setCalendarEntries([]));
  }

  function calendarRange(): { start: string; end: string } {
    if (calendarView === 'week') return { start: week.start, end: week.end };
    const ym = `${monthYear.year}-${String(monthYear.month + 1).padStart(2, '0')}`;
    const lastDay = new Date(monthYear.year, monthYear.month + 1, 0).getDate();
    return { start: `${ym}-01`, end: `${ym}-${String(lastDay).padStart(2, '0')}` };
  }

  function fetchCalendarEvents() {
    const { start, end } = calendarRange();
    fetch(`/api/calendar-events?startDate=${start}&endDate=${end}`)
      .then((r) => r.json())
      .then((data) => setCalendarEvents(data.events || []))
      .catch(() => setCalendarEvents([]));
  }

  useEffect(() => {
    fetchCalendarEvents();
  }, [calendarView, weekOffset, monthYear]);

  function openNewEvent() {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const { start, end } = calendarRange();
    // Default to today when it is on screen, otherwise to the first visible day
    const date = today >= start && today <= end ? today : start;
    setEventDraft({ date, startTime: null, endTime: null, title: '', note: null });
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

  // Auto-fill from schedule when date changes or after form reset.
  // Falls back to the user's default start/end times (Settings) when the day
  // has no schedule entry.
  useEffect(() => {
    if (!date) return;
    let fill: { startTime: string; endTime: string; breakMinutes: number } | null = null;
    if (scheduleA.length > 0 && !(referenceDate && date < referenceDate)) {
      const d = new Date(date + 'T12:00:00');
      const jsDay = d.getDay();
      const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
      const allSchedules = { A: scheduleA, B: scheduleB, C: scheduleC, D: scheduleD };
      const wt = referenceDate ? getWeekType(date, referenceDate, weekCount) : 'A';
      const schedEntry = allSchedules[wt].find((s) => s.dayOfWeek === dayOfWeek);
      if (schedEntry && schedEntry.startTime) fill = schedEntry;
    }
    if (!fill && defaultTimes) {
      fill = { startTime: defaultTimes.start, endTime: defaultTimes.end, breakMinutes: 0 };
    }
    if (fill && !startTime && !endTime) {
      setStartTime(fill.startTime);
      setEndTime(fill.endTime);
      // If auto is off, set break from schedule; if auto is on, the auto-break effect handles it
      if (!autoBreakEnabled) {
        if (fill.breakMinutes > 0) {
          setBreakPeriods([generateBreakPeriod(fill.startTime, fill.endTime, fill.breakMinutes, date)]);
        } else {
          setBreakPeriods([]);
        }
      }
    }
  }, [date, scheduleA, scheduleB, scheduleC, scheduleD, referenceDate, weekCount, refillTrigger, defaultTimes]);

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
  const isAbsence = entryType === 'sick' || entryType === 'vab';

  // Fyll i timmar för en heldags frånvaro: använd schemat för dagen, annars 8h
  function fillFullDayHours() {
    const sched = getScheduleForDate(date);
    const h = sched ? calcHoursPreview(sched.startTime, sched.endTime, sched.breakMinutes) : '';
    setManualHours(h || '8');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return; // a double-click must not create duplicate entries
    setSubmitError('');
    // end <= start is treated as an overnight shift (+24h) — confirm so a
    // typo like 18:00-08:00 doesn't silently become a 14-hour entry
    if (startTime && endTime && endTime <= startTime) {
      const overnightHours = calcHoursPreview(startTime, endTime, sumBreakMinutes(breakPeriods.filter((bp) => bp.start && bp.end)));
      if (!window.confirm(`Sluttiden är före starttiden — detta sparas som ett nattpass över midnatt (${overnightHours}h). Fortsätta?`)) {
        return;
      }
    }
    setSubmitting(true);
    try {
      const validPeriods = breakPeriods.filter((bp) => bp.start && bp.end);
      // For absence (sick/VAB) without start/end times, send hours directly (full-day entry)
      const useManualHours = isAbsence && (!startTime || !endTime) && manualHours;
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
          ...(useManualHours ? { hours: parseFloat(manualHours) } : {}),
          entryType,
          overtimeType,
          hourlyRateOverride: rateOverride.trim() || null,
          description,
          taskSegments: serializeTaskSegments(taskSegments),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSubmitError(err.error || 'Kunde inte spara tidsregistrering');
        return;
      }
    } catch {
      setSubmitError('Nätverksfel');
      return;
    } finally {
      setSubmitting(false);
    }
    setStartTime('');
    setEndTime('');
    setBreakPeriods([]);
    setDescription('');
    setSelectedTemplate('');
    setOvertimeType('none');
    setRateOverride('');
    setEntryType('work');
    setManualHours('');
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
      <PageHeader title="Tidsregistrering" />

      {vacationConflicts.length > 0 && (
        <div className="mb-6 p-4 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900">
          <p className="font-semibold">
            {vacationConflicts.length === 1 ? 'Ett pass ligger på en semesterdag' : `${vacationConflicts.length} pass ligger på semesterdagar`}
          </p>
          <p className="mt-1">
            De räknas både som arbetad tid och som semester. Ta bort passet om du var ledig, eller ta bort semesterdagen om du jobbade.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {vacationConflicts.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setDetailEntry(entry)}
                className="px-2.5 py-1 rounded-md border border-amber-300 bg-white hover:bg-amber-100"
              >
                {weekdayShort(entry.date)} {parseInt(entry.date.slice(8))}/{parseInt(entry.date.slice(5, 7))} {entry.date.slice(0, 4)}
                {entry.startTime && entry.endTime ? ` · ${entry.startTime}–${entry.endTime}` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
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

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
              required={!isAbsence}
              title="Starttid"
              onPicked={() => endTimePicker.current?.open()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sluttid</label>
            <TimePicker
              ref={endTimePicker}
              value={endTime}
              onChange={setEndTime}
              required={!isAbsence}
              title="Sluttid"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4">
          <div className="col-span-2">
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
                    onPicked={() => breakEndPickers.current[idx]?.open()}
                    title="Rast start"
                    placeholder="Start"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <span className="text-gray-400 text-sm">–</span>
                  <TimePicker
                    ref={(el) => { breakEndPickers.current[idx] = el; }}
                    value={bp.end}
                    onChange={(v) => {
                      setAutoBreakEnabled(false);
                      setBreakPeriods((prev) => prev.map((p, i) => i === idx ? { ...p, end: v } : p));
                    }}
                    title="Rast slut"
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
            <div className="flex items-center gap-3 mt-1">
              <button
                type="button"
                onClick={() => { setAutoBreakEnabled(false); setBreakPeriods((prev) => [...prev, { start: '', end: '' }]); }}
                className="text-xs text-blue-600 hover:underline"
              >
                + Lägg till rast
              </button>
              {(autoBreakEnabled || breakPeriods.length > 0) && (
                <button
                  type="button"
                  onClick={() => { setAutoBreakEnabled(false); setBreakPeriods([]); }}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  Ingen rast
                </button>
              )}
            </div>
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
              <option value="vab">VAB (vård av sjukt barn)</option>
            </select>
          </div>
          {isAbsence && (
            <div className="col-span-2 lg:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Timmar (heldag utan tider)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  placeholder="t.ex. 8"
                  className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={fillFullDayHours}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Heldag
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Lämna start/sluttid tomma och ange antal timmar — eller fyll i tider som vanligt.
              </p>
            </div>
          )}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Egen timlön för passet</label>
            <input
              type="text"
              inputMode="decimal"
              value={rateOverride}
              onChange={(e) => setRateOverride(e.target.value)}
              placeholder="Vanlig timlön"
              className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Fyll bara i om passet har en annan timlön, t.ex. ett vikariat. Gäller grundlön, OB och övertid för passet.
            </p>
          </div>
          <div className="col-span-2 lg:col-span-1">
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

        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] 2xl:static -mx-4 sm:mx-0 mt-4 px-4 sm:px-0 py-3 sm:py-0 bg-white/95 backdrop-blur border-t border-gray-100 sm:border-0 flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:gap-4">
          <button type="submit" disabled={submitting} className="w-full sm:w-auto bg-blue-600 text-white font-semibold px-6 py-3 sm:py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            Spara
          </button>
          {previewHours && (
            <span className="text-sm text-gray-600 text-center sm:text-left">
              Beräknade timmar: <strong className="text-blue-600">{previewHours}h</strong>
            </span>
          )}
        </div>
        {submitError && (
          <p className="mt-2 text-sm text-red-600">{submitError}</p>
        )}
      </form>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Kalender</h2>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={openNewEvent}
              className="text-sm px-3 py-1.5 rounded-md border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"
            >
              + Händelse
            </button>
            <CalendarViewToggle view={calendarView} onChange={setCalendarView} />
          </div>
        </div>

        {calendarView === 'week' ? (
          <CalendarWeekView
            weekOffset={weekOffset}
            entries={entries}
            vacationDays={calendarVacationDays}
            events={calendarEvents}
            onEventClick={setEventDraft}
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
            highlightDate={highlightDate}
          />
        ) : (
          <CalendarMonthView
            year={monthYear.year}
            month={monthYear.month}
            entries={calendarEntries}
            vacationDays={calendarVacationDays}
            events={calendarEvents}
            onEventClick={setEventDraft}
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
            highlightDate={highlightDate}
          />
        )}

        {/* Phone: one card per entry; tapping opens the details dialog (edit/delete live there) */}
        <div className="sm:hidden mt-4 space-y-2">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setDetailEntry(entry)}
              className="w-full text-left flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white active:bg-gray-50"
            >
              <div className="w-11 shrink-0 text-center">
                <div className="text-[11px] text-gray-500 uppercase">{weekdayShort(entry.date)}</div>
                <div className="text-lg font-bold text-gray-900 leading-none">{parseInt(entry.date.slice(8))}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-900">
                  {entry.startTime && entry.endTime ? `${entry.startTime}–${entry.endTime}` : 'Heldag'}
                  {entry.breakPeriods && entry.breakPeriods.length > 0
                    ? <span className="text-gray-400 font-normal"> · {sumBreakMinutes(entry.breakPeriods)}m rast</span>
                    : entry.breakMinutes ? <span className="text-gray-400 font-normal"> · {entry.breakMinutes}m rast</span> : null}
                </div>
                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                  {entry.entryType !== 'work' && (
                    <span className={`text-[11px] px-1.5 py-0.5 rounded ${entry.entryType === 'sick' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {entry.entryType === 'sick' ? 'Sjuk' : 'VAB'}
                    </span>
                  )}
                  {entry.overtimeType !== 'none' && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                      {entry.overtimeType === 'mertid' ? 'Mertid' : entry.overtimeType === 'enkel' ? 'Enkel ÖT' : 'Kval ÖT'}
                    </span>
                  )}
                  {entry.hourlyRateOverride != null && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      {entry.hourlyRateOverride.toLocaleString('sv-SE')} kr/h
                    </span>
                  )}
                  <span className="text-xs text-gray-500 truncate">{entry.description || entry.projectName}</span>
                </div>
              </div>
              <div className="shrink-0 text-base font-semibold text-blue-700">{entry.hours.toFixed(2)}h</div>
            </button>
          ))}
        </div>

        <div className="hidden sm:block overflow-x-auto mt-6">
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
                      entry.entryType === 'sick' ? 'bg-red-100 text-red-700'
                      : entry.entryType === 'vab' ? 'bg-orange-100 text-orange-700'
                      : 'bg-green-100 text-green-700'
                    }`}>
                      {entry.entryType === 'sick' ? 'Sjuk' : entry.entryType === 'vab' ? 'VAB' : 'Arbete'}
                    </span>
                    {entry.overtimeType !== 'none' && (
                      <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                        {entry.overtimeType === 'mertid' ? 'Mertid' :
                         entry.overtimeType === 'enkel' ? 'Enkel ÖT' : 'Kval ÖT'}
                      </span>
                    )}
                    {entry.hourlyRateOverride != null && (
                      <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                        {entry.hourlyRateOverride.toLocaleString('sv-SE')} kr/h
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
      <CalendarEventDialog
        event={eventDraft}
        onClose={() => setEventDraft(null)}
        onSaved={fetchCalendarEvents}
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
