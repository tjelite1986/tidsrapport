'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import BarChart from '@/components/charts/BarChart';

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

export default function DashboardPage() {
  const { data: session } = useSession();
  const [weekEntries, setWeekEntries] = useState<TimeEntry[]>([]);
  const [monthEntries, setMonthEntries] = useState<TimeEntry[]>([]);
  const [salary, setSalary] = useState<SalarySummary | null>(null);
  const [vacationBalance, setVacationBalance] = useState<number | null>(null);

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

    fetch(`/api/salary?month=${currentMonth}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setSalary({
        netPay: data.netPay,
        basePay: data.basePay,
        totalOB: data.totalOB,
        totalOvertimePay: data.totalOvertimePay,
        grossPay: data.grossPay,
      }))
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
  const weekChartData = weekDayHours.map((h, i) => ({ label: dayNames[i], value: h }));

  const now = new Date();
  const monthName = now.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-slate-400 text-sm mb-1 capitalize">{monthName}</p>
          <h1 className="text-2xl font-bold">Hej, {session?.user?.name?.split(' ')[0]}!</h1>
          <p className="text-slate-400 text-sm mt-1">
            {weekTotal > 0
              ? `Du har registrerat ${weekTotal.toFixed(1)} timmar denna vecka.`
              : 'Inga registreringar denna vecka ännu.'}
          </p>
        </div>
        <Link
          href="/tid"
          className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Registrera tid
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Timmar denna vecka"
          value={`${weekTotal.toFixed(1)}h`}
          sub={`${weekEntries.length} pass`}
          color="blue"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatCard
          label="Timmar denna månad"
          value={`${monthTotal.toFixed(1)}h`}
          sub={`${monthEntries.length} pass`}
          color="indigo"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Uppskattad nettolön"
          value={salary ? formatCurrency(salary.netPay) : '—'}
          sub={salary && salary.totalOB > 0 ? `varav OB ${formatCurrency(salary.totalOB)}` : 'denna månad'}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        <StatCard
          label="Semestersaldo"
          value={vacationBalance !== null ? formatCurrency(vacationBalance) : '—'}
          sub="intjänat saldo"
          color="amber"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
      </div>

      {/* Salary breakdown */}
      {salary && salary.grossPay > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Lönefördelning denna månad</h2>
            <Link href="/lon" className="text-sm text-blue-600 hover:underline">Visa detaljer →</Link>
          </div>
          <SalaryBar basePay={salary.basePay} ob={salary.totalOB} overtime={salary.totalOvertimePay} gross={salary.grossPay} />
        </div>
      )}

      {/* Charts + Projects */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {weekEntries.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Timmar per projekt (denna månad)</h2>
            <div className="space-y-3">
              {Object.entries(projectSummary)
                .sort(([, a], [, b]) => b - a)
                .map(([project, hours]) => (
                  <div key={project}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 font-medium truncate pr-2">{project}</span>
                      <span className="text-gray-500 shrink-0">{hours.toFixed(1)}h</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, (hours / monthTotal) * 100)}%` }}
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
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

function StatCard({
  label, value, sub, color, icon,
}: {
  label: string;
  value: string;
  sub: string;
  color: 'blue' | 'indigo' | 'green' | 'amber';
  icon: React.ReactNode;
}) {
  const colors = {
    blue: { bg: 'bg-blue-50', icon: 'bg-blue-500', text: 'text-blue-600' },
    indigo: { bg: 'bg-indigo-50', icon: 'bg-indigo-500', text: 'text-indigo-600' },
    green: { bg: 'bg-emerald-50', icon: 'bg-emerald-500', text: 'text-emerald-600' },
    amber: { bg: 'bg-amber-50', icon: 'bg-amber-500', text: 'text-amber-600' },
  };
  const c = colors[color];

  return (
    <div className={`${c.bg} rounded-xl p-4 flex flex-col gap-3`}>
      <div className={`${c.icon} w-9 h-9 rounded-lg flex items-center justify-center text-white`}>
        {icon}
      </div>
      <div>
        <div className={`text-xl font-bold ${c.text}`}>{value}</div>
        <div className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</div>
        <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
      </div>
    </div>
  );
}

function SalaryBar({ basePay, ob, overtime, gross }: { basePay: number; ob: number; overtime: number; gross: number }) {
  const baseW = gross > 0 ? (basePay / gross) * 100 : 0;
  const obW = gross > 0 ? (ob / gross) * 100 : 0;
  const otW = gross > 0 ? (overtime / gross) * 100 : 0;

  return (
    <div>
      <div className="flex rounded-full overflow-hidden h-3 mb-3">
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
