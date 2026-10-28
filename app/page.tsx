'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import BarChart from '@/components/charts/BarChart';
import StatTile from '@/components/ui/StatTile';
import CountUp from '@/components/ui/CountUp';

interface TimeEntry {
  id: number;
  projectName: string;
  date: string;
  hours: number;
  startTime: string | null;
  endTime: string | null;
  entryType: string;
  description: string | null;
}

interface PayDay {
  date: string;
  basePay: number;
  obResult: { totalOBAmount: number } | null;
  overtimePay: number;
  sickPay: number;
}

const dayGross = (d: PayDay) => d.basePay + (d.obResult?.totalOBAmount ?? 0) + d.overtimePay + d.sickPay;

interface SalarySummary {
  netPay: number;
  basePay: number;
  totalOB: number;
  totalOvertimePay: number;
  grossPay: number;
}

function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekDates(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toLocalDate(monday), end: toLocalDate(sunday) };
}

function getMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toLocalDate(start), end: toLocalDate(end) };
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount);
}

const dayNames = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

function formatShiftDay(dateStr: string): string {
  const today = toLocalDate(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === today) return 'idag';
  if (dateStr === toLocalDate(tomorrow)) return 'imorgon';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDuration(minutes: number): string {
  if (minutes >= 48 * 60) return `${Math.round(minutes / (24 * 60))} dagar`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function shiftTimes(shift: TimeEntry): { start: Date; end: Date } {
  const start = new Date(`${shift.date}T${shift.startTime}:00`);
  const end = new Date(`${shift.date}T${shift.endTime ?? shift.startTime}:00`);
  // A night shift ends the next day
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

const formatHours = (v: number) => `${v.toFixed(1)}h`;

// Cards rise in one after another
const rise = (step: number) => ({ animationDelay: `${step * 70}ms` });

export default function DashboardPage() {
  const { data: session } = useSession();
  const [weekEntries, setWeekEntries] = useState<TimeEntry[]>([]);
  const [monthEntries, setMonthEntries] = useState<TimeEntry[]>([]);
  const [salary, setSalary] = useState<SalarySummary | null>(null);
  const [payDays, setPayDays] = useState<Record<string, PayDay[]>>({});
  const [vacationBalance, setVacationBalance] = useState<number | null>(null);
  const [nextShift, setNextShift] = useState<TimeEntry | null>(null);
  // Ticks so the shift countdown and progress stay current while the page is open
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const week = getWeekDates();
    const month = getMonthRange();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    fetch(`/api/time-entries?startDate=${week.start}&endDate=${week.end}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setWeekEntries)
      .catch(() => {});

    fetch(`/api/time-entries?startDate=${month.start}&endDate=${month.end}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setMonthEntries)
      .catch(() => {});

    // Next shift: the first work entry from now on (synced schedule entries are future entries)
    const soon = new Date(now);
    soon.setDate(now.getDate() + 14);
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    fetch(`/api/time-entries?startDate=${toLocalDate(now)}&endDate=${toLocalDate(soon)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: TimeEntry[]) => {
        const upcoming = list
          .filter((e) => e.entryType === 'work' && e.startTime)
          .filter((e) => e.date > toLocalDate(now) || (e.endTime ?? '') > nowTime)
          .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
        setNextShift(upcoming[0] ?? null);
      })
      .catch(() => {});

    // A week that started last month needs that month's days too
    const weekMonth = week.start.slice(0, 7);
    if (weekMonth !== currentMonth) {
      fetch(`/api/salary?month=${weekMonth}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data?.days && setPayDays((prev) => ({ ...prev, [weekMonth]: data.days })))
        .catch(() => {});
    }

    fetch(`/api/salary?month=${currentMonth}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && (data.days && setPayDays((prev) => ({ ...prev, [currentMonth]: data.days })), setSalary({
        netPay: data.netPay,
        basePay: data.basePay,
        totalOB: data.totalOB,
        totalOvertimePay: data.totalOvertimePay,
        grossPay: data.grossPay,
      })))
      .catch(() => {});

    fetch('/api/vacation-pay')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setVacationBalance(data.balance))
      .catch(() => {});
  }, []);

  const weekTotal = weekEntries.reduce((sum, e) => sum + e.hours, 0);
  const monthTotal = monthEntries.reduce((sum, e) => sum + e.hours, 0);

  const projectSummary = monthEntries.reduce<Record<string, number>>((acc, e) => {
    acc[e.projectName] = (acc[e.projectName] || 0) + e.hours;
    return acc;
  }, {});

  const weekDayHours = [0, 0, 0, 0, 0, 0, 0];
  for (const entry of weekEntries) {
    const d = new Date(entry.date + 'T12:00:00');
    const jsDay = d.getDay();
    const idx = jsDay === 0 ? 6 : jsDay - 1;
    weekDayHours[idx] += entry.hours;
  }
  const now = clock;
  const today = toLocalDate(now);
  const todayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const weekChartData = weekDayHours.map((h, i) => ({
    label: dayNames[i],
    value: h,
    highlight: i === todayIdx,
    muted: i > todayIdx,
  }));

  // One bar per day of the month; days after today hold planned (synced) shifts
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthDayHours = new Array<number>(daysInMonth).fill(0);
  for (const entry of monthEntries) {
    const day = Number(entry.date.slice(8, 10));
    if (day >= 1 && day <= daysInMonth) monthDayHours[day - 1] += entry.hours;
  }
  const monthShort = now.toLocaleDateString('sv-SE', { month: 'short' });
  const monthChartData = monthDayHours.map((h, i) => {
    const day = i + 1;
    return {
      label: day === 1 || day % 5 === 0 ? String(day) : '',
      value: h,
      highlight: day === now.getDate(),
      muted: day > now.getDate(),
      hint: `${day} ${monthShort}: ${h.toFixed(1)}h${day > now.getDate() ? ' (planerat)' : ''}`,
    };
  });
  const workedSoFar = monthEntries.filter((e) => e.date <= today).reduce((sum, e) => sum + e.hours, 0);
  const plannedRest = monthTotal - workedSoFar;

  const monthName = now.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
  const monthLabel = now.toLocaleDateString('sv-SE', { month: 'long' });
  const monthProgress = (now.getDate() / daysInMonth) * 100;

  // Earned so far this week: gross per day from the salary calculation, Monday to today
  const weekStart = getWeekDates().start;
  // Today counts once its shifts are over, so the figure never includes pay not yet earned
  const todayDone = weekEntries
    .filter((e) => e.date === today && e.entryType === 'work' && e.startTime)
    .every((e) => shiftTimes(e).end <= now);
  const weekLast = todayDone ? today : toLocalDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const weekEarned = Object.values(payDays)
    .flat()
    .filter((d) => d.date >= weekStart && d.date <= weekLast)
    .reduce((sum, d) => sum + dayGross(d), 0);
  const weekWorkedHours = weekEntries
    .filter((e) => e.entryType === 'work' && e.date >= weekStart && e.date <= weekLast)
    .reduce((sum, e) => sum + e.hours, 0);

  // The next (or ongoing) shift, shown in its own panel in the hero
  let shift: { ongoing: boolean; day: string; span: string; countdown: string; progress: number } | null = null;
  if (nextShift) {
    const { start, end } = shiftTimes(nextShift);
    const span = `${nextShift.startTime}–${nextShift.endTime}`;
    if (start <= now && now < end) {
      shift = {
        ongoing: true,
        day: 'Idag',
        span,
        countdown: `slutar om ${formatDuration((end.getTime() - now.getTime()) / 60000)}`,
        progress: ((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100,
      };
    } else if (now < start) {
      shift = {
        ongoing: false,
        day: formatShiftDay(nextShift.date),
        span,
        countdown: `om ${formatDuration((start.getTime() - now.getTime()) / 60000)}`,
        progress: 0,
      };
    }
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-white rounded-2xl p-5 sm:p-6 animate-rise">
        <div aria-hidden className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full bg-blue-500/30 blur-3xl animate-drift" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/4 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl animate-drift [animation-delay:-8s]" />
        <div aria-hidden className="pointer-events-none absolute top-1/3 -left-16 w-48 h-48 rounded-full bg-emerald-400/10 blur-3xl animate-drift [animation-delay:-4s]" />

        <div className="relative grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-w-0">
            <p className="text-slate-400 text-sm mb-1 capitalize">{monthName}</p>
            <h1 className="text-2xl font-bold">Hej, {session?.user?.name?.split(' ')[0]}!</h1>
            {weekWorkedHours > 0 ? (
              <>
                <p className="text-slate-300 text-sm mt-4">Den här veckan har du jobbat ihop</p>
                <p className="mt-0.5 leading-tight">
                  <span className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent">
                    <CountUp value={weekEarned} format={formatCurrency} duration={1400} />
                  </span>
                  <span className="block sm:inline text-slate-300 text-base sm:ml-2">
                    på <strong className="text-white"><CountUp value={weekWorkedHours} format={(v) => v.toFixed(1)} duration={1400} /></strong> arbetade timmar
                  </span>
                </p>
                <p className="text-xs text-slate-500 mt-1">Brutto inkl. OB, före skatt</p>
              </>
            ) : (
              <p className="text-slate-300 text-sm mt-4">Inga arbetade timmar den här veckan ännu.</p>
            )}
          </div>

          {/* Next shift */}
          <div className="rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur-sm p-4 sm:min-w-[16rem] animate-rise [animation-delay:150ms]">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              {shift?.ongoing && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                </span>
              )}
              {shift?.ongoing ? 'Pass pågår' : 'Nästa arbetspass'}
            </p>
            {shift ? (
              <>
                <p className="mt-2 text-lg font-semibold capitalize">{shift.day}</p>
                <p className="text-3xl font-bold tabular-nums tracking-tight">{shift.span}</p>
                <p className="mt-1 text-sm text-emerald-300">{shift.countdown}</p>
                {shift.ongoing && (
                  <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-1000" style={{ width: `${shift.progress}%` }} />
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-300">Inga inplanerade pass de närmaste två veckorna.</p>
            )}
            <Link
              href="/tid"
              className="relative overflow-hidden mt-4 flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm shadow-lg shadow-blue-500/30"
            >
              <span aria-hidden className="absolute inset-0 animate-shimmer" />
              <svg className="relative w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="relative">Registrera tid</span>
            </Link>
          </div>
        </div>

        <div className="relative mt-5">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Dag {now.getDate()} av {daysInMonth}</span>
            <span><CountUp value={workedSoFar} format={formatHours} /> arbetat{plannedRest > 0 && <> · {plannedRest.toFixed(1)}h planerat</>}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-400 animate-grow-x" style={{ width: `${monthProgress}%` }} />
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 [&>*]:animate-rise [&>*:nth-child(2)]:[animation-delay:70ms] [&>*:nth-child(3)]:[animation-delay:140ms] [&>*:nth-child(4)]:[animation-delay:210ms]">
        <StatTile
          label="Timmar denna vecka"
          value={<CountUp value={weekTotal} format={formatHours} />}
          sub={`${weekEntries.length} pass`}
          tone="time"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatTile
          label="Timmar denna månad"
          value={<CountUp value={monthTotal} format={formatHours} />}
          sub={`${monthEntries.length} pass`}
          tone="time"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatTile
          label="Uppskattad nettolön"
          value={salary ? <CountUp value={salary.netPay} format={formatCurrency} duration={1200} /> : '—'}
          sub={salary && salary.totalOB > 0 ? `varav OB ${formatCurrency(salary.totalOB)}` : 'denna månad'}
          tone="money"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        <StatTile
          label="Semestersaldo"
          value={vacationBalance !== null ? <CountUp value={vacationBalance} format={formatCurrency} duration={1200} /> : '—'}
          sub="intjänat saldo"
          tone="vacation"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
      </div>

      {/* Salary breakdown */}
      {salary && salary.grossPay > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 animate-rise" style={rise(5)}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Lönefördelning denna månad</h2>
            <Link href="/lon" className="text-sm text-blue-600 hover:underline">Visa detaljer →</Link>
          </div>
          <SalaryBar basePay={salary.basePay} ob={salary.totalOB} overtime={salary.totalOvertimePay} gross={salary.grossPay} />
        </div>
      )}

      {/* Hours per day this month */}
      {monthEntries.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 animate-rise" style={rise(6)}>
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="font-semibold text-gray-800">Timmar per dag i {monthLabel}</h2>
            <div className="flex gap-3 text-xs text-gray-500 shrink-0">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />Arbetat</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 opacity-40" />Planerat</span>
            </div>
          </div>
          <BarChart data={monthChartData} color="#6366f1" height={150} showValues={false} />
        </div>
      )}

      {/* Charts + Projects */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {weekEntries.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 animate-rise" style={rise(7)}>
            <BarChart
              data={weekChartData}
              title="Timmar per veckodag (denna vecka)"
              color="#3b82f6"
              height={180}
              formatValue={(v) => v.toFixed(1)}
            />
          </div>
        )}

        {Object.keys(projectSummary).length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 animate-rise" style={rise(8)}>
            <h2 className="font-semibold text-gray-800 mb-4">Timmar per projekt (denna månad)</h2>
            <div className="space-y-3">
              {Object.entries(projectSummary)
                .sort(([, a], [, b]) => b - a)
                .map(([project, hours], i) => (
                  <div key={project}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 font-medium truncate pr-2">{project}</span>
                      <span className="text-gray-500 shrink-0">{hours.toFixed(1)}h</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-400 to-blue-600 h-2 rounded-full animate-grow-x"
                        style={{ width: `${Math.min(100, (hours / monthTotal) * 100)}%`, animationDelay: `${300 + i * 120}ms` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent entries */}
      {weekEntries.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-rise" style={rise(9)}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Senaste registreringar</h2>
            <Link href="/tid" className="text-sm text-blue-600 hover:underline">Visa alla →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-50">
                {weekEntries.slice(0, 8).map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{entry.date}</td>
                    <td className="px-5 py-3 font-medium text-gray-800 truncate max-w-[140px]">{entry.projectName}</td>
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                      {entry.startTime && entry.endTime ? `${entry.startTime}–${entry.endTime}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-gray-700 whitespace-nowrap">{entry.hours.toFixed(1)}h</td>
                    <td className="px-5 py-3 text-gray-400 truncate max-w-[160px] hidden md:table-cell">
                      {entry.description || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-gray-400 text-center pb-2">
        Löneberäkningar är uppskattningar baserade på Handels kollektivavtal och ersätter inte ett officiellt lönebesked.
      </p>
    </div>
  );
}

function SalaryBar({ basePay, ob, overtime, gross }: { basePay: number; ob: number; overtime: number; gross: number }) {
  const baseW = gross > 0 ? (basePay / gross) * 100 : 0;
  const obW = gross > 0 ? (ob / gross) * 100 : 0;
  const otW = gross > 0 ? (overtime / gross) * 100 : 0;

  return (
    <div>
      <div className="flex rounded-full overflow-hidden h-3 mb-3 animate-grow-x [animation-delay:300ms]">
        {baseW > 0 && <div className="bg-blue-500 transition-all" style={{ width: `${baseW}%` }} />}
        {obW > 0 && <div className="bg-orange-400 transition-all" style={{ width: `${obW}%` }} />}
        {otW > 0 && <div className="bg-amber-400 transition-all" style={{ width: `${otW}%` }} />}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <LegendItem color="bg-blue-500" label="Grundlön" value={formatCurrency(basePay)} />
        {ob > 0 && <LegendItem color="bg-orange-400" label="OB" value={formatCurrency(ob)} />}
        {overtime > 0 && <LegendItem color="bg-amber-400" label="Övertid" value={formatCurrency(overtime)} />}
      </div>
    </div>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-700">{value}</span>
    </div>
  );
}
