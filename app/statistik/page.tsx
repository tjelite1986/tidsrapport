'use client';

import { useEffect, useState } from 'react';
import BarChart from '@/components/charts/BarChart';
import PieChart from '@/components/charts/PieChart';
import StackedBarChart from '@/components/charts/StackedBarChart';
import DonutChart from '@/components/charts/DonutChart';
import LineChart from '@/components/charts/LineChart';

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const dayNames = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

interface StatsData {
  year: string;
  monthlyHours: { month: string; totalHours: number; count: number }[];
  projectHours: { projectName: string; totalHours: number }[];
  weekdayHours: number[];
  weekdayAvg: number[];
  weekdayCount: number[];
  entryTypes: { entryType: string; totalHours: number; count: number }[];
  monthlyIncome: { month: string; basePay: number; obPay: number; netPay: number }[];
  obDistribution: { percent: number; hours: number; amount: number }[];
  departmentHours: { department: string; totalHours: number }[];
  departmentMonthly: { month: string; data: { department: string; hours: number }[] }[];
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(amount);
}

export default function StatistikPage() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    fetch(`/api/stats?year=${year}`)
      .then((r) => r.json())
      .then(setStats);
  }, [year]);

  if (!stats) return <div>Laddar...</div>;

  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    const found = stats.monthlyHours.find((h) => h.month === m);
    return { label: monthNames[i], value: found?.totalHours ?? 0 };
  });

  const projectData = stats.projectHours.map((p) => ({
    label: p.projectName,
    value: p.totalHours,
  }));

  const weekdayData = stats.weekdayHours.map((h, i) => ({
    label: dayNames[i],
    value: h,
  }));

  const weekdayAvgData = (stats.weekdayAvg ?? []).map((h, i) => ({
    label: dayNames[i],
    value: h,
  }));

  // Stacked bar chart data for monthly income
  const monthlyIncomeData = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    const found = stats.monthlyIncome?.find((h) => h.month === m);
    return {
      label: monthNames[i],
      segments: [
        { value: found?.basePay ?? 0, color: '#3b82f6', label: 'Grundlön' },
        { value: found?.obPay ?? 0, color: '#f97316', label: 'OB-tillägg' },
      ],
    };
  });

  // Department colors
  const deptColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  // Department bar chart data
  const deptBarData = (stats.departmentHours || []).map((d, i) => ({
    label: d.department,
    value: d.totalHours,
    color: deptColors[i % deptColors.length],
  }));

  // Department stacked monthly chart
  const allDepts = (stats.departmentHours || []).map((d) => d.department);
  const deptMonthlyStackData = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    const monthData = (stats.departmentMonthly || []).find((d) => d.month === m);
    return {
      label: monthNames[i],
      segments: allDepts.map((dept, di) => ({
        value: monthData?.data.find((d) => d.department === dept)?.hours ?? 0,
        color: deptColors[di % deptColors.length],
        label: dept,
      })),
    };
  });

  // Department donut chart
  const deptDonutData = (stats.departmentHours || []).map((d, i) => ({
    label: d.department,
    value: d.totalHours,
    color: deptColors[i % deptColors.length],
  }));

  // OB distribution for donut chart
  const obColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  const obDonutData = (stats.obDistribution || []).map((ob, i) => ({
    label: `OB ${ob.percent}%`,
    value: ob.amount,
    color: obColors[i % obColors.length],
  }));

  // Net pay trend for line chart
  const netPayTrend = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
    const found = stats.monthlyIncome?.find((h) => h.month === m);
    return { label: monthNames[i], value: found?.netPay ?? 0 };
  });

  const totalHours = stats.monthlyHours.reduce((sum, m) => sum + m.totalHours, 0);
  const totalEntries = stats.monthlyHours.reduce((sum, m) => sum + m.count, 0);
  const totalNet = (stats.monthlyIncome || []).reduce((sum, m) => sum + m.netPay, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Statistik</h1>

      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm font-medium text-gray-700">År:</label>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {[...Array(5)].map((_, i) => {
            const y = new Date().getFullYear() - i;
            return <option key={y} value={y}>{y}</option>;
          })}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Totalt {year}</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">{totalHours.toFixed(1)}h</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Registreringar</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">{totalEntries}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Snitt/månad</h3>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {stats.monthlyHours.length > 0 ? (totalHours / stats.monthlyHours.length).toFixed(1) : '0'}h
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Total netto</h3>
          <p className="text-3xl font-bold text-green-600 mt-2">{formatCurrency(totalNet)} kr</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly income stacked bar */}
        <div className="bg-white p-6 rounded-lg shadow">
          <StackedBarChart
            data={monthlyIncomeData}
            title="Månatlig inkomst (Grundlön + OB)"
            height={240}
            formatValue={(v) => `${(v / 1000).toFixed(0)}k`}
          />
        </div>

        {/* OB distribution donut */}
        {obDonutData.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <DonutChart
              data={obDonutData}
              title="OB-fördelning"
              size={180}
              formatValue={(v) => `${formatCurrency(v)} kr`}
            />
          </div>
        )}

        {/* Total hours per weekday */}
        <div className="bg-white p-6 rounded-lg shadow">
          <BarChart
            data={weekdayData}
            title="Totalt timmar per veckodag"
            color="#10b981"
            height={200}
            formatValue={(v) => v.toFixed(0)}
          />
          <p className="text-xs text-gray-400 mt-2">Summan av alla timmar registrerade per veckodag under {stats.year}.</p>
        </div>

        {/* Average hours per weekday */}
        <div className="bg-white p-6 rounded-lg shadow">
          <BarChart
            data={weekdayAvgData}
            title="Snittimmar per veckodag"
            color="#8b5cf6"
            height={200}
            formatValue={(v) => v.toFixed(1)}
          />
          <p className="text-xs text-gray-400 mt-2">Genomsnittligt antal timmar per pass, uppdelat per veckodag.</p>
        </div>

        {/* Net pay trend */}
        <div className="bg-white p-6 rounded-lg shadow">
          <LineChart
            data={netPayTrend}
            title="Nettolöneutveckling"
            color="#10b981"
            height={220}
            formatValue={(v) => v > 0 ? `${(v / 1000).toFixed(0)}k` : ''}
          />
        </div>

        {/* Hours per month */}
        <div className="bg-white p-6 rounded-lg shadow">
          <BarChart
            data={monthlyData}
            title="Timmar per månad"
            color="#3b82f6"
            height={220}
            formatValue={(v) => v.toFixed(0)}
          />
        </div>

        {/* Hours per project */}
        <div className="bg-white p-6 rounded-lg shadow">
          <PieChart
            data={projectData}
            title="Timmar per projekt"
            size={180}
          />
        </div>

        {stats.entryTypes.length > 1 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <PieChart
              data={stats.entryTypes.map((e) => ({
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

      {deptBarData.length > 0 && (
        <>
          <h2 className="text-xl font-bold mt-8 mb-4">Avdelningsstatistik</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <BarChart
                data={deptBarData}
                title="Timmar per avdelning"
                height={240}
                formatValue={(v) => v.toFixed(1)}
              />
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <DonutChart
                data={deptDonutData}
                title="Fördelning per avdelning"
                size={180}
                formatValue={(v) => `${v.toFixed(1)}h`}
              />
            </div>
            {allDepts.length > 0 && (
              <div className="bg-white p-6 rounded-lg shadow lg:col-span-2">
                <StackedBarChart
                  data={deptMonthlyStackData}
                  title="Timmar per avdelning och månad"
                  height={240}
                  formatValue={(v) => v.toFixed(1)}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
