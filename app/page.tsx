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

const dayNames = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

const featureCards = [
  { href: '/tid', title: 'Tidsregistrering', desc: 'Logga arbetstid med start/sluttid, raster och övertid.', color: 'bg-blue-500' },
  { href: '/lon', title: 'Löneberäkning', desc: 'Se lönespecifikation med OB, övertid och skatt.', color: 'bg-green-500' },
  { href: '/timer', title: 'Live Timer', desc: 'Starta en timer och spara automatiskt.', color: 'bg-purple-500' },
  { href: '/statistik', title: 'Statistik', desc: 'Diagram och trender för din arbetstid och lön.', color: 'bg-orange-500' },
  { href: '/rapporter', title: 'Rapporter', desc: 'Exportera tidsrapporter som CSV.', color: 'bg-red-500' },
];

const laborInfo = [
  {
    title: 'Kollektivavtal',
    content: 'Kollektivavtal reglerar löner, arbetstider och andra villkor. Handels kollektivavtal gäller för butik och lager med specifika OB-tillägg för kvällar, helger och storhelger.',
  },
  {
    title: 'Fackförbund',
    content: 'Handelsanställdas förbund organiserar anställda inom handel och lager. Medlemskap ger tillgång till rådgivning, försäkringar och juridisk hjälp.',
  },
  {
    title: 'A-kassa',
    content: 'Handelsanställdas a-kassa ger ekonomisk trygghet vid arbetslöshet. Kvalificeringstid är normalt 12 månaders medlemskap och 6 månaders arbete.',
  },
];

const resourceLinks = [
  { label: 'Arbetsmiljöverket', url: 'https://www.av.se' },
  { label: 'Diskrimineringsombudsmannen', url: 'https://www.do.se' },
  { label: 'Arbetsförmedlingen', url: 'https://www.arbetsformedlingen.se' },
  { label: 'Skatteverket', url: 'https://www.skatteverket.se' },
];

export default function DashboardPage() {
  const { data: session } = useSession();
  const [weekEntries, setWeekEntries] = useState<TimeEntry[]>([]);
  const [monthEntries, setMonthEntries] = useState<TimeEntry[]>([]);
  const [expandedInfo, setExpandedInfo] = useState<number | null>(null);

  useEffect(() => {
    const week = getWeekDates();
    const month = getMonthRange();
    fetch(`/api/time-entries?startDate=${week.start}&endDate=${week.end}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setWeekEntries)
      .catch(() => setWeekEntries([]));
    fetch(`/api/time-entries?startDate=${month.start}&endDate=${month.end}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setMonthEntries)
      .catch(() => setMonthEntries([]));
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

  return (
    <div>
      {/* Welcome */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl p-4 sm:p-6 mb-6">
        <h1 className="text-2xl font-bold">Välkommen, {session?.user?.name}!</h1>
        <p className="text-blue-100 mt-1">
          Tidsrapport hjälper dig att registrera arbetstid, beräkna lön med OB-tillägg och hålla koll på din ekonomi.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Denna vecka</h3>
          <p className="text-2xl sm:text-3xl font-bold text-blue-600 mt-2">{weekTotal.toFixed(1)}h</p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Denna månad</h3>
          <p className="text-2xl sm:text-3xl font-bold text-blue-600 mt-2">{monthTotal.toFixed(1)}h</p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Registreringar denna vecka</h3>
          <p className="text-2xl sm:text-3xl font-bold text-blue-600 mt-2">{weekEntries.length}</p>
        </div>
      </div>

      {/* Feature overview */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Funktioner</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {featureCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="bg-white rounded-lg shadow hover:shadow-md transition p-4 group"
            >
              <div className={`w-10 h-10 ${card.color} rounded-lg mb-3 flex items-center justify-center`}>
                <div className="w-5 h-5 bg-white/30 rounded" />
              </div>
              <h3 className="font-semibold text-sm group-hover:text-blue-600 transition">{card.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{card.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Charts and data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {Object.keys(projectSummary).length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Timmar per projekt (denna månad)</h2>
            <div className="space-y-3">
              {Object.entries(projectSummary)
                .sort(([, a], [, b]) => b - a)
                .map(([project, hours]) => (
                  <div key={project} className="flex items-center justify-between">
                    <span className="font-medium">{project}</span>
                    <div className="flex items-center space-x-3">
                      <div className="w-24 sm:w-48 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${Math.min(100, (hours / monthTotal) * 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-12 text-right">{hours.toFixed(1)}h</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {weekEntries.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <BarChart
              data={weekChartData}
              title="Timmar per veckodag (denna vecka)"
              color="#3b82f6"
              height={200}
              formatValue={(v) => v.toFixed(1)}
            />
          </div>
        )}
      </div>

      {/* Recent entries */}
      {weekEntries.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
          <h2 className="text-lg font-semibold p-6 pb-3">Senaste registreringar</h2>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Projekt</th>
                <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Tid</th>
                <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Timmar</th>
                <th className="px-3 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Beskrivning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {weekEntries.slice(0, 10).map((entry) => (
                <tr key={entry.id}>
                  <td className="px-3 py-2 sm:px-6 sm:py-3">{entry.date}</td>
                  <td className="px-3 py-2 sm:px-6 sm:py-3">{entry.projectName}</td>
                  <td className="px-3 py-2 sm:px-6 sm:py-3 text-sm text-gray-600">
                    {entry.startTime && entry.endTime ? `${entry.startTime}-${entry.endTime}` : '-'}
                  </td>
                  <td className="px-3 py-2 sm:px-6 sm:py-3">{entry.hours.toFixed(1)}</td>
                  <td className="px-3 py-2 sm:px-6 sm:py-3 text-gray-600">{entry.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Labor law information */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Arbetsrättsinformation</h2>
        <div className="space-y-2">
          {laborInfo.map((info, i) => (
            <div key={i} className="bg-white rounded-lg shadow overflow-hidden">
              <button
                onClick={() => setExpandedInfo(expandedInfo === i ? null : i)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition"
              >
                <span className="font-medium">{info.title}</span>
                <svg className={`w-5 h-5 text-gray-400 transition-transform ${expandedInfo === i ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedInfo === i && (
                <div className="px-4 pb-4 text-sm text-gray-600">{info.content}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Resource links */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Resurslänkar</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {resourceLinks.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white p-4 rounded-lg shadow text-center hover:shadow-md transition break-words"
            >
              <span className="text-sm font-medium text-blue-600 hover:underline">{link.label}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
        <strong>Observera:</strong> Löneberäkningarna i denna app är uppskattningar baserade på Handels kollektivavtal.
        De ersätter inte ett officiellt lönebesked från din arbetsgivare. Kontrollera alltid mot din faktiska lönespecifikation.
      </div>
    </div>
  );
}
