'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import BarChart from '@/components/charts/BarChart';
import StatTile from '@/components/ui/StatTile';
import CountUp from '@/components/ui/CountUp';
import Panel from '@/components/dashboard/Panel';
import { useApi, type ApiStatus } from '@/components/dashboard/useApi';
import {
  addDays, describeShift, ENTRY_TYPE_LABEL, monthKey, monthRange, recentActivity, sumHours, toLocalDate,
  upcomingShifts, weekEarned, weekRange, earnedState, earnedLabels, type SalaryMode, dayLabel, type DashEntry, type PayDay,
} from '@/lib/dashboard/summary';

interface SalaryResponse {
  netPay: number;
  basePay: number;
  totalOB: number;
  totalOvertimePay: number;
  grossPay: number;
  days?: PayDay[];
  settings?: { salaryMode?: SalaryMode };
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount);
const formatHours = (v: number) => `${v.toFixed(1)}h`;
const dayNames = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

const icon = (d: string) => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
);

const QUICK_LINKS = [
  { href: '/tid', label: 'Tid & kalender', hint: 'Registrera och redigera', d: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { href: '/lon', label: 'Lön', hint: 'Beräknad månadslön', d: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { href: '/lonespecar', label: 'Lönespecar', hint: 'Jämför mot beräkning', d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { href: '/semester', label: 'Semester', hint: 'Dagar och ersättning', d: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
  { href: '/statistik', label: 'Statistik', hint: 'Diagram över tid', d: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { href: '/notiser', label: 'Notiser', hint: 'Schemaändringar', d: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
];

export default function DashboardPage() {
  const { data: session } = useSession();
  // Ticks so countdowns and "earned so far" stay current while the page is open
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Query windows are fixed per calendar day, so the 30 s tick does not refetch
  const day = toLocalDate(now);
  const urls = useMemo(() => {
    const d = new Date(`${day}T12:00:00`);
    const week = weekRange(d);
    const month = monthRange(d);
    const q = (s: string, e: string) => `/api/time-entries?startDate=${s}&endDate=${e}`;
    return {
      week: q(week.start, week.end),
      month: q(month.start, month.end),
      upcoming: q(day, toLocalDate(addDays(d, 14))),
      recent: q(toLocalDate(addDays(d, -30)), day),
      salary: `/api/salary?month=${monthKey(d)}`,
      // A week that began last month needs that month's per-day pay too
      prevSalary: week.start.slice(0, 7) !== monthKey(d) ? `/api/salary?month=${week.start.slice(0, 7)}` : null,
    };
  }, [day]);

  const week = useApi<DashEntry[]>(urls.week);
  const month = useApi<DashEntry[]>(urls.month);
  const upcoming = useApi<DashEntry[]>(urls.upcoming);
  const recent = useApi<DashEntry[]>(urls.recent);
  const salary = useApi<SalaryResponse>(urls.salary);
  const prevSalary = useApi<SalaryResponse>(urls.prevSalary);
  const vacation = useApi<{ balance: number }>('/api/vacation-pay');

  const weekEntries = week.data ?? [];
  const monthEntries = month.data ?? [];
  const today = toLocalDate(now);
  const shifts = upcomingShifts(upcoming.data ?? [], now, 5);
  const nextInfo = shifts[0] ? describeShift(shifts[0], now) : null;

  const payDays = [...(prevSalary.data?.days ?? []), ...(salary.data?.days ?? [])];
  const earned = weekEarned(payDays, weekEntries, now);
  const earnedText = earnedLabels(salary.data?.settings?.salaryMode);
  // The earned figure needs the salary days; say nothing rather than a wrong 0
  const earnedStatus = earnedState([week.status, salary.status, ...(urls.prevSalary === null ? [] : [prevSalary.status])]);
  const earnedReady = earnedStatus === 'ready';
  const reloadEarned = () => { week.reload(); salary.reload(); if (urls.prevSalary) prevSalary.reload(); };

  const weekTotal = sumHours(weekEntries);
  const monthTotal = sumHours(monthEntries);
  const workedSoFar = sumHours(monthEntries, today);
  const plannedRest = monthTotal - workedSoFar;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const monthDayHours = new Array<number>(daysInMonth).fill(0);
  for (const entry of monthEntries) {
    const d = Number(entry.date.slice(8, 10));
    if (d >= 1 && d <= daysInMonth) monthDayHours[d - 1] += entry.hours;
  }
  const monthShort = now.toLocaleDateString('sv-SE', { month: 'short' });
  const chartData = monthDayHours.map((h, i) => ({
    label: i === 0 || (i + 1) % 5 === 0 ? String(i + 1) : '',
    value: h,
    highlight: i + 1 === now.getDate(),
    muted: i + 1 > now.getDate(),
    hint: `${i + 1} ${monthShort}: ${h.toFixed(1)}h${i + 1 > now.getDate() ? ' (planerat)' : ''}`,
  }));

  const monthName = now.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
  const sal = salary.data;
  const tileValue = (status: ApiStatus, value: React.ReactNode) =>
    status === 'loading' ? <span className="text-gray-400" aria-label="Laddar">…</span>
    : status === 'error' ? <span className="text-gray-400" title="Kunde inte hämtas">—</span>
    : value;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section aria-label="Översikt" className="relative overflow-hidden bg-gradient-to-br from-night via-night to-night-panel text-white hero-3d rounded-2xl p-5 sm:p-6 ring-1 ring-sky-400/20 animate-rise">
        <div aria-hidden className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full bg-brand-cyan/25 blur-3xl animate-drift" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/4 w-72 h-72 rounded-full bg-brand-indigo/20 blur-3xl animate-drift [animation-delay:-8s]" />

        <div className="relative grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-w-0">
            <p className="text-slate-300 text-sm mb-1 capitalize">{monthName}</p>
            <h1 className="text-2xl font-bold">Hej{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}!</h1>
            <div className="mt-4 min-h-[4.5rem]" aria-live="polite">
              {!earnedReady ? (
                earnedStatus === 'error' ? (
                  <p className="text-slate-300 text-sm">
                    Veckans intjänade kunde inte hämtas.{' '}
                    <button type="button" onClick={reloadEarned} className="underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Försök igen</button>
                  </p>
                ) : <p className="text-slate-300 text-sm">Räknar ihop veckan…</p>
              ) : earned.hours > 0 ? (
                <>
                  <p className="text-slate-300 text-sm">{earnedText.heading}</p>
                  <p className="mt-0.5 leading-tight">
                    <span className="text-3xl sm:text-4xl font-bold text-brand-cyan">
                      <CountUp value={earned.gross} format={formatCurrency} duration={1400} />
                    </span>
                    <span className="block sm:inline text-slate-300 text-base sm:ml-2">
                      på <strong className="text-white">{earned.hours.toFixed(1)}</strong> arbetade timmar
                    </span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">{earnedText.note}</p>
                </>
              ) : (
                <p className="text-slate-300 text-sm">Inga arbetade timmar den här veckan ännu.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur-sm p-4 sm:min-w-[16rem]">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
              {nextInfo?.ongoing && (
                <span aria-hidden className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-brand-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-success" />
                </span>
              )}
              {nextInfo?.ongoing ? 'Pass pågår' : 'Nästa arbetspass'}
            </p>
            {upcoming.status === 'loading' ? (
              <p className="mt-2 text-sm text-slate-300" role="status">Laddar…</p>
            ) : upcoming.status === 'error' ? (
              <p className="mt-2 text-sm text-red-300" role="alert">
                Kunde inte hämta pass.{' '}
                <button type="button" onClick={upcoming.reload} className="underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Försök igen</button>
              </p>
            ) : nextInfo ? (
              <>
                <p className="mt-2 text-lg font-semibold capitalize">{nextInfo.day}</p>
                <p className="text-3xl font-bold tabular-nums tracking-tight">{nextInfo.span}</p>
                <p className="mt-1 text-sm text-brand-cyan">{nextInfo.countdown}</p>
                {nextInfo.ongoing && (
                  <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-label="Passets framfart" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(nextInfo.progress)}>
                    <div className="h-full rounded-full bg-brand-cyan transition-[width] duration-1000 motion-reduce:transition-none" style={{ width: `${nextInfo.progress}%` }} />
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-300">Inga inplanerade pass de närmaste två veckorna.</p>
            )}
            <Link
              href="/tid"
              className="mt-4 flex items-center justify-center gap-2 bg-brand-cyan hover:bg-sky-300 text-night font-semibold px-4 py-2 rounded-lg transition-colors text-sm shadow-lg shadow-sky-500/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {icon('M12 4v16m8-8H4')}
              Registrera tid
            </Link>
          </div>
        </div>

        {month.status === 'ready' && (
          <div className="relative mt-5">
            <div className="flex justify-between text-xs text-slate-300 mb-1">
              <span>Dag {now.getDate()} av {daysInMonth}</span>
              <span>{formatHours(workedSoFar)} arbetat{plannedRest > 0 && <> · {plannedRest.toFixed(1)}h planerat</>}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-label="Månadens förlopp" aria-valuemin={1} aria-valuemax={daysInMonth} aria-valuenow={now.getDate()}>
              <div className="h-full rounded-full bg-gradient-to-r from-brand-cyan to-brand-indigo" style={{ width: `${(now.getDate() / daysInMonth) * 100}%` }} />
            </div>
          </div>
        )}
      </section>

      {/* KPI cards */}
      <section aria-label="Nyckeltal" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Timmar denna vecka"
          value={tileValue(week.status, formatHours(weekTotal))}
          sub={week.status === 'ready' ? `${weekEntries.length} pass` : undefined}
          tone="time"
          icon={icon('M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z')}
        />
        <StatTile
          label="Timmar denna månad"
          value={tileValue(month.status, formatHours(monthTotal))}
          sub={month.status === 'ready' ? `${monthEntries.length} pass` : undefined}
          tone="time"
          icon={icon('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z')}
        />
        <StatTile
          label="Uppskattad nettolön"
          value={tileValue(salary.status, sal ? formatCurrency(sal.netPay) : '—')}
          sub={salary.status === 'ready' ? (sal && sal.totalOB > 0 ? `varav OB ${formatCurrency(sal.totalOB)}` : 'denna månad') : undefined}
          tone="money"
          icon={icon('M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z')}
        />
        <StatTile
          label="Semestersaldo"
          value={tileValue(vacation.status, vacation.data ? formatCurrency(vacation.data.balance) : '—')}
          sub={vacation.status === 'ready' ? 'intjänat saldo' : undefined}
          tone="vacation"
          icon={icon('M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z')}
        />
      </section>

      {(salary.status === 'error' || vacation.status === 'error') && (
        <div className="flex flex-wrap gap-3 text-sm">
          {salary.status === 'error' && <button type="button" onClick={salary.reload} className="underline text-sky-700 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">Hämta lön igen</button>}
          {vacation.status === 'error' && <button type="button" onClick={vacation.reload} className="underline text-sky-700 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">Hämta semestersaldo igen</button>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming shifts */}
        <Panel id="dash-upcoming" title="Kommande pass" status={upcoming.status} onRetry={upcoming.reload} href="/tid" hrefLabel="Kalender" empty={shifts.length === 0} emptyText="Inga inplanerade pass de närmaste två veckorna.">
          <ul className="divide-y divide-gray-100">
            {shifts.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 capitalize">{dayLabel(s.date, now)}</p>
                  <p className="text-gray-500 truncate">{s.projectName}{s.description ? ` · ${s.description}` : ''}</p>
                </div>
                <p className="font-semibold tabular-nums text-sky-700 whitespace-nowrap">{s.startTime}–{s.endTime}</p>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Salary breakdown */}
        <Panel id="dash-salary" title="Lönefördelning denna månad" status={salary.status} onRetry={salary.reload} href="/lon" hrefLabel="Detaljer" empty={!sal || sal.grossPay <= 0} emptyText="Ingen beräknad lön för månaden ännu.">
          {sal && (
            <>
              <SalaryBar basePay={sal.basePay} ob={sal.totalOB} overtime={sal.totalOvertimePay} gross={sal.grossPay} />
              <p className="text-sm text-gray-500 mt-3">Brutto <strong className="text-gray-800">{formatCurrency(sal.grossPay)}</strong> · netto <strong className="text-gray-800">{formatCurrency(sal.netPay)}</strong></p>
            </>
          )}
        </Panel>

        {/* Hours per day */}
        <Panel id="dash-hours" title="Timmar per dag denna månad" status={month.status} onRetry={month.reload} href="/statistik" hrefLabel="Statistik" empty={monthEntries.length === 0} emptyText="Inga registreringar den här månaden ännu." className="lg:col-span-2">
          <BarChart data={chartData} color="#38BDF8" height={150} showValues={false} />
          <p className="text-xs text-gray-500 mt-2">Dagar efter idag visar planerade pass.</p>
        </Panel>

        {/* Recent activity */}
        <Panel id="dash-recent" title="Senaste aktivitet" status={recent.status} onRetry={recent.reload} href="/tid" hrefLabel="Visa alla" empty={(recent.data ?? []).filter((e) => e.date <= today).length === 0} emptyText="Inga registreringar de senaste 30 dagarna." className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Senaste registreringar</caption>
              <thead className="sr-only"><tr><th scope="col">Datum</th><th scope="col">Projekt</th><th scope="col">Tid</th><th scope="col">Timmar</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {recentActivity(recent.data ?? [], now, 6).map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">{entry.date}</td>
                    <td className="py-2.5 pr-4 font-medium text-gray-800 truncate max-w-[10rem]">
                      {entry.projectName}
                      {entry.entryType !== 'work' && <span className="ml-2 text-xs rounded-full bg-red-50 text-red-700 px-2 py-0.5">{ENTRY_TYPE_LABEL[entry.entryType] ?? entry.entryType}</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">{entry.startTime && entry.endTime ? `${entry.startTime}–${entry.endTime}` : '—'}</td>
                    <td className="py-2.5 text-right font-medium text-gray-700 whitespace-nowrap">{entry.hours.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* Quick links */}
      <nav aria-label="Genvägar">
        <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {QUICK_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="block h-full bg-white rounded-xl card-3d card-lift border border-gray-100 p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-100 text-sky-700 mb-2 [&>svg]:w-4 [&>svg]:h-4">{icon(l.d)}</span>
                <span className="block text-sm font-semibold text-gray-800">{l.label}</span>
                <span className="block text-xs text-gray-500">{l.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="text-xs text-gray-500 text-center pb-2">
        Löneberäkningar är uppskattningar baserade på Handels kollektivavtal och ersätter inte ett officiellt lönebesked.
      </p>
    </div>
  );
}

function SalaryBar({ basePay, ob, overtime, gross }: { basePay: number; ob: number; overtime: number; gross: number }) {
  const w = (v: number) => (gross > 0 ? (v / gross) * 100 : 0);
  return (
    <div>
      <div className="flex rounded-full overflow-hidden h-3 mb-3" aria-hidden>
        {basePay > 0 && <div className="bg-sky-500" style={{ width: `${w(basePay)}%` }} />}
        {ob > 0 && <div className="bg-orange-400" style={{ width: `${w(ob)}%` }} />}
        {overtime > 0 && <div className="bg-amber-400" style={{ width: `${w(overtime)}%` }} />}
      </div>
      <ul className="flex flex-wrap gap-4 text-sm">
        <Legend color="bg-sky-500" label="Grundlön" value={formatCurrency(basePay)} />
        {ob > 0 && <Legend color="bg-orange-400" label="OB" value={formatCurrency(ob)} />}
        {overtime > 0 && <Legend color="bg-amber-400" label="Övertid" value={formatCurrency(overtime)} />}
      </ul>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className={`w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-700">{value}</span>
    </li>
  );
}
