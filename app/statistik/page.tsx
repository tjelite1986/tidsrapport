'use client';

import { useEffect, useState } from 'react';
import BarChart from '@/components/charts/BarChart';
import PieChart from '@/components/charts/PieChart';
import StackedBarChart from '@/components/charts/StackedBarChart';
import DonutChart from '@/components/charts/DonutChart';
import LineChart from '@/components/charts/LineChart';

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const dayNames = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const deptColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

interface MonthIncome {
  month: string;
  basePay: number;
  obPay: number;
  overtimePay: number;
  grossPay: number;
  netPay: number;
}

interface StatsData {
  year: string;
  allTime: boolean;
  allYears: string[];
  monthlyHours: { month: string; totalHours: number; count: number }[];
  projectHours: { projectName: string; totalHours: number }[];
  weekdayHours: number[];
  weekdayAvg: number[];
  weekdayCount: number[];
  entryTypes: { entryType: string; totalHours: number; count: number }[];
  monthlyIncome: MonthIncome[];
  obDistribution: { percent: number; hours: number; amount: number }[];
  departmentHours: { department: string; totalHours: number }[];
  departmentMonthly: { month: string; data: { department: string; hours: number }[] }[];
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(amount);
}

function formatCurrencyFull(amount: number) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount);
}

export default function StatistikPage() {
  const currentYear = String(new Date().getFullYear());
  const [year, setYear] = useState(currentYear);
  const [allTimeData, setAllTimeData] = useState<StatsData | null>(null);
  const [yearData, setYearData] = useState<StatsData | null>(null);
  const [loadingAllTime, setLoadingAllTime] = useState(true);
  const [loadingYear, setLoadingYear] = useState(true);

  // Ladda flerårsdata en gång
  useEffect(() => {
    setLoadingAllTime(true);
    fetch('/api/stats?year=all')
      .then((r) => r.json())
      .then((d) => { setAllTimeData(d); setLoadingAllTime(false); })
      .catch(() => setLoadingAllTime(false));
  }, []);

  // Ladda per-år-data när år byts
  useEffect(() => {
    setLoadingYear(true);
    fetch(`/api/stats?year=${year}`)
      .then((r) => r.json())
      .then((d) => { setYearData(d); setLoadingYear(false); })
      .catch(() => setLoadingYear(false));
  }, [year]);

  const availableYears = allTimeData?.allYears ?? [currentYear];

  // Flerårig lönetrend — alla tillgängliga månader
  const allTimeIncome = (allTimeData?.monthlyIncome ?? []).sort((a, b) => a.month.localeCompare(b.month));

  const allTimeTrend = allTimeIncome.map((m) => {
    const [y, mo] = m.month.split('-');
    return { label: `${monthNames[parseInt(mo) - 1]} ${y}`, value: m.netPay };
  });

  const allTimeGrossTrend = allTimeIncome.map((m) => {
    const [y, mo] = m.month.split('-');
    return { label: `${monthNames[parseInt(mo) - 1]} ${y}`, value: m.grossPay };
  });

  // Per-år beräkningar
  const stats = yearData;
  const monthlyData = stats
    ? Array.from({ length: 12 }, (_, i) => {
        const m = `${year}-${String(i + 1).padStart(2, '0')}`;
        const found = stats.monthlyHours.find((h) => h.month === m);
        return { label: monthNames[i], value: found?.totalHours ?? 0 };
      })
    : [];

  const monthlyIncomeData = stats
    ? Array.from({ length: 12 }, (_, i) => {
        const m = `${year}-${String(i + 1).padStart(2, '0')}`;
        const found = stats.monthlyIncome?.find((h) => h.month === m);
        return {
          label: monthNames[i],
          segments: [
            { value: found?.basePay ?? 0, color: '#3b82f6', label: 'Grundlön' },
            { value: found?.obPay ?? 0, color: '#f97316', label: 'OB' },
            { value: found?.overtimePay ?? 0, color: '#f59e0b', label: 'Övertid' },
          ],
        };
      })
    : [];

  const netPayTrend = stats
    ? Array.from({ length: 12 }, (_, i) => {
        const m = `${year}-${String(i + 1).padStart(2, '0')}`;
        const found = stats.monthlyIncome?.find((h) => h.month === m);
        return { label: monthNames[i], value: found?.netPay ?? 0 };
      })
    : [];

  const weekdayData = (stats?.weekdayHours ?? []).map((h, i) => ({ label: dayNames[i], value: h }));
  const weekdayAvgData = (stats?.weekdayAvg ?? []).map((h, i) => ({ label: dayNames[i], value: h }));
  const projectData = (stats?.projectHours ?? []).map((p) => ({ label: p.projectName, value: p.totalHours }));

  const totalHours = (stats?.monthlyHours ?? []).reduce((sum, m) => sum + m.totalHours, 0);
  const totalEntries = (stats?.monthlyHours ?? []).reduce((sum, m) => sum + m.count, 0);
  const totalNet = (stats?.monthlyIncome ?? []).reduce((sum, m) => sum + m.netPay, 0);
  const totalGross = (stats?.monthlyIncome ?? []).reduce((sum, m) => sum + m.grossPay, 0);
  const avgMonthlyNet = stats?.monthlyIncome?.length ? totalNet / stats.monthlyIncome.length : 0;

  const bestMonth = stats?.monthlyIncome?.length
    ? stats.monthlyIncome.reduce((best, m) => m.netPay > best.netPay ? m : best)
    : null;

  const obColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  const obDonutData = (stats?.obDistribution ?? []).map((ob, i) => ({
    label: `OB ${ob.percent}%`,
    value: ob.amount,
    color: obColors[i % obColors.length],
  }));

  const deptBarData = (stats?.departmentHours ?? []).map((d, i) => ({
    label: d.department,
    value: d.totalHours,
    color: deptColors[i % deptColors.length],
  }));
  const allDepts = (stats?.departmentHours ?? []).map((d) => d.department);
  const deptDonutData = deptBarData;
  const deptMonthlyStackData = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    const monthData = (stats?.departmentMonthly ?? []).find((d) => d.month === m);
    return {
      label: monthNames[i],
      segments: allDepts.map((dept, di) => ({
        value: monthData?.data.find((d) => d.department === dept)?.hours ?? 0,
        color: deptColors[di % deptColors.length],
        label: dept,
      })),
    };
  });

  // All-time KPIs
  const allTimeNet = allTimeIncome.reduce((s, m) => s + m.netPay, 0);
  const allTimeAvg = allTimeIncome.length ? allTimeNet / allTimeIncome.length : 0;
  const allTimeBest = allTimeIncome.length
    ? allTimeIncome.reduce((best, m) => m.netPay > best.netPay ? m : best)
    : null;

  function monthLabel(m: string) {
    const [y, mo] = m.split('-');
    return `${monthNames[parseInt(mo) - 1]} ${y}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl p-6">
        <h1 className="text-2xl font-bold">Statistik</h1>
        <p className="text-slate-400 text-sm mt-1">Löneutveckling och arbetstidsanalys</p>
      </div>

      {/* ===== FLERÅRIG LÖNEUTVECKLING ===== */}
      {!loadingAllTime && allTimeIncome.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-800 px-1">Löneutveckling — alla månader</h2>

          {/* All-time KPI-kort */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Total nettolön (all tid)"
              value={formatCurrencyFull(allTimeNet)}
              color="emerald"
            />
            <KpiCard
              label="Snitt nettolön/månad"
              value={formatCurrencyFull(allTimeAvg)}
              color="blue"
            />
            <KpiCard
              label="Bästa månaden"
              value={allTimeBest ? formatCurrencyFull(allTimeBest.netPay) : '—'}
              sub={allTimeBest ? monthLabel(allTimeBest.month) : ''}
              color="amber"
            />
            <KpiCard
              label="Månader med data"
              value={String(allTimeIncome.length)}
              color="indigo"
            />
          </div>

          {/* Nettolöne-linjechart */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Nettolön per månad</h3>
            </div>
            <LineChart
              data={allTimeTrend}
              color="#10b981"
              height={220}
              formatValue={(v) => v > 0 ? `${(v / 1000).toFixed(0)}k` : ''}
            />
          </div>

          {/* Brutto vs netto stackad */}
          {allTimeIncome.length >= 2 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Brutto vs Netto (skatteavdrag synligt)</h3>
              <StackedBarChart
                data={allTimeIncome.map((m) => {
                  const [y, mo] = m.month.split('-');
                  return {
                    label: `${monthNames[parseInt(mo) - 1]} ${y.slice(2)}`,
                    segments: [
                      { value: m.netPay, color: '#10b981', label: 'Netto' },
                      { value: Math.max(0, m.grossPay - m.netPay), color: '#e5e7eb', label: 'Skatt' },
                    ],
                  };
                })}
                height={200}
                formatValue={(v) => v > 0 ? `${(v / 1000).toFixed(0)}k` : ''}
              />
            </div>
          )}
        </div>
      )}

      {/* ===== PER-ÅR STATISTIK ===== */}
      <div className="border-t border-gray-100 pt-6 space-y-4">
        {/* Årsväljare */}
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-800">Detaljerad statistik</h2>
          <div className="flex gap-1">
            {availableYears.map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  year === y
                    ? 'bg-slate-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {loadingYear ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-400 text-sm">
            Laddar {year}...
          </div>
        ) : stats ? (
          <>
            {/* KPI-kort för valt år */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard label={`Timmar ${year}`} value={`${totalHours.toFixed(1)}h`} color="blue" />
              <KpiCard label="Registreringar" value={String(totalEntries)} color="indigo" />
              <KpiCard
                label="Snitt/månad"
                value={`${stats.monthlyHours.length > 0 ? (totalHours / stats.monthlyHours.length).toFixed(1) : '0'}h`}
                color="purple"
              />
              <KpiCard label={`Nettolön ${year}`} value={formatCurrencyFull(totalNet)} color="emerald" />
            </div>

            {/* Rad 2 KPI */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard label="Bruttolön (total)" value={formatCurrencyFull(totalGross)} color="slate" />
              <KpiCard label="Snitt netto/månad" value={formatCurrencyFull(avgMonthlyNet)} color="teal" />
              <KpiCard
                label="Bästa månaden"
                value={bestMonth ? formatCurrencyFull(bestMonth.netPay) : '—'}
                sub={bestMonth ? monthLabel(bestMonth.month) : ''}
                color="amber"
              />
              <KpiCard
                label="OB totalt"
                value={formatCurrencyFull((stats.obDistribution ?? []).reduce((s, o) => s + o.amount, 0))}
                color="orange"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Inkomst per månad (staplad) */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <StackedBarChart
                  data={monthlyIncomeData}
                  title="Inkomst per månad (Grundlön · OB · Övertid)"
                  height={240}
                  formatValue={(v) => `${(v / 1000).toFixed(0)}k`}
                />
              </div>

              {/* Nettolön per månad (linje) */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <LineChart
                  data={netPayTrend}
                  title={`Nettolön per månad ${year}`}
                  color="#10b981"
                  height={240}
                  formatValue={(v) => v > 0 ? `${(v / 1000).toFixed(0)}k` : ''}
                />
              </div>

              {/* Timmar per månad */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <BarChart
                  data={monthlyData}
                  title={`Timmar per månad ${year}`}
                  color="#3b82f6"
                  height={220}
                  formatValue={(v) => v.toFixed(0)}
                />
              </div>

              {/* OB-fördelning */}
              {obDonutData.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <DonutChart
                    data={obDonutData}
                    title="OB-fördelning"
                    size={180}
                    formatValue={(v) => `${formatCurrency(v)} kr`}
                  />
                </div>
              )}

              {/* Timmar per veckodag */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <BarChart
                  data={weekdayData}
                  title="Totalt timmar per veckodag"
                  color="#10b981"
                  height={200}
                  formatValue={(v) => v.toFixed(0)}
                />
                <p className="text-xs text-gray-400 mt-2">Summan av alla timmar per veckodag under {year}.</p>
              </div>

              {/* Snitt per veckodag */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <BarChart
                  data={weekdayAvgData}
                  title="Snittimmar per veckodag"
                  color="#8b5cf6"
                  height={200}
                  formatValue={(v) => v.toFixed(1)}
                />
                <p className="text-xs text-gray-400 mt-2">Genomsnittligt antal timmar per pass, per veckodag.</p>
              </div>

              {/* Timmar per projekt */}
              {projectData.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <PieChart data={projectData} title="Timmar per projekt" size={180} />
                </div>
              )}

              {/* Arbete vs Sjukdagar */}
              {(stats.entryTypes ?? []).length > 1 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <PieChart
                    data={(stats.entryTypes ?? []).map((e) => ({
                      label: e.entryType === 'sick' ? 'Sjukdagar' : 'Arbete',
                      value: e.totalHours,
                      color: e.entryType === 'sick' ? '#ef4444' : '#3b82f6',
                    }))}
                    title="Arbete vs Sjukdagar"
                    size={180}
                  />
                </div>
              )}
            </div>

            {/* Avdelningsstatistik */}
            {deptBarData.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-base font-semibold text-gray-800">Avdelningsstatistik {year}</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                    <BarChart
                      data={deptBarData}
                      title="Timmar per avdelning"
                      height={240}
                      formatValue={(v) => v.toFixed(1)}
                    />
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                    <DonutChart
                      data={deptDonutData}
                      title="Fördelning per avdelning"
                      size={180}
                      formatValue={(v) => `${v.toFixed(1)}h`}
                    />
                  </div>
                  {allDepts.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 lg:col-span-2">
                      <StackedBarChart
                        data={deptMonthlyStackData}
                        title="Timmar per avdelning och månad"
                        height={240}
                        formatValue={(v) => v.toFixed(1)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: 'blue' | 'indigo' | 'emerald' | 'amber' | 'purple' | 'slate' | 'teal' | 'orange';
}) {
  const colors: Record<string, { bg: string; text: string }> = {
    blue:    { bg: 'bg-blue-50',    text: 'text-blue-700' },
    indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-700' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    amber:   { bg: 'bg-amber-50',   text: 'text-amber-700' },
    purple:  { bg: 'bg-purple-50',  text: 'text-purple-700' },
    slate:   { bg: 'bg-slate-50',   text: 'text-slate-700' },
    teal:    { bg: 'bg-teal-50',    text: 'text-teal-700' },
    orange:  { bg: 'bg-orange-50',  text: 'text-orange-700' },
  };
  const c = colors[color] ?? colors.blue;

  return (
    <div className={`${c.bg} rounded-xl p-4`}>
      <p className="text-xs text-gray-500 mb-1 leading-tight">{label}</p>
      <p className={`text-lg font-bold ${c.text} leading-tight`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
