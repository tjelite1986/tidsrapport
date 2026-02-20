'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import TotalSummaryCard from '@/components/salary/TotalSummaryCard';
import VacationPayTracker from '@/components/salary/VacationPayTracker';
import { generatePayslipPDF } from '@/lib/pdf/payslip-generator';

interface DayDetail {
  date: string;
  hours: number;
  basePay: number;
  obResult: { totalOBAmount: number; segments: { hours: number; obPercent: number; obAmount: number }[] } | null;
  overtimePay: number;
  overtimeType: string;
  sickPay: number;
  entryType: string;
}

interface OBBreakdownItem {
  percent: number;
  hours: number;
  amount: number;
}

interface SalaryData {
  user: { id: number; name: string; salaryType: string };
  month: string;
  settings: {
    workplaceType: string;
    contractLevel: string;
    taxRate: number;
    vacationPayRate: number;
    vacationPayMode: string;
    taxMode?: string;
    taxTable?: number | null;
  };
  days: DayDetail[];
  totalHours: number;
  workHours: number;
  sickDays: number;
  basePay: number;
  totalOB: number;
  obBreakdown: OBBreakdownItem[];
  overtidMertid: number;
  overtidEnkel: number;
  overtidKvalificerad: number;
  totalOvertimePay: number;
  sickPay: number;
  grossBeforeVacation: number;
  vacationPay: number;
  grossPay: number;
  tax: number;
  netPay: number;
  hourlyRate: number;
}

interface UserOption {
  id: number;
  name: string;
}

export default function LonPage() {
  const { data: session } = useSession();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [salary, setSalary] = useState<SalaryData | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [includeVacation, setIncludeVacation] = useState(false);
  const [vacationRefreshKey, setVacationRefreshKey] = useState(0);

  const isAdmin = session?.user?.role === 'admin';

  useEffect(() => {
    if (isAdmin) {
      fetch('/api/users').then((r) => r.json()).then(setUsers);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchSalary();
    fetchInclusion();
  }, [month, selectedUser]);

  function getWorkMonth(paymentMonth: string): string {
    const [year, mon] = paymentMonth.split('-').map(Number);
    const d = new Date(year, mon - 2, 1); // month - 1 for 0-index, then - 1 more for previous
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  async function fetchInclusion() {
    const workMonth = getWorkMonth(month);
    const res = await fetch(`/api/vacation-pay-inclusion?month=${workMonth}`);
    if (res.ok) {
      const data = await res.json();
      setIncludeVacation(data.includeInSalary ?? false);
    }
  }

  async function fetchSalary() {
    const workMonth = getWorkMonth(month);
    const params = new URLSearchParams({ month: workMonth });
    if (selectedUser) params.set('userId', selectedUser);
    const res = await fetch(`/api/salary?${params}`);
    if (res.ok) setSalary(await res.json());
  }

  async function handleToggleVacation() {
    const workMonth = getWorkMonth(month);
    const newValue = !includeVacation;
    setIncludeVacation(newValue);
    await fetch('/api/vacation-pay-inclusion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: workMonth, includeInSalary: newValue }),
    });
    // Hämta om lönedata och semesterpott med ny inställning
    fetchSalary();
    setVacationRefreshKey((k) => k + 1);
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(amount);
  }

  function exportPDF() {
    if (!salary) return;
    const doc = generatePayslipPDF({
      month,
      employeeName: salary.user.name,
      employerName: '',
      hourlyRate: salary.hourlyRate,
      totalHours: salary.totalHours,
      workHours: salary.workHours,
      sickDays: salary.sickDays,
      basePay: salary.basePay,
      totalOB: salary.totalOB,
      obBreakdown: salary.obBreakdown || [],
      overtidMertid: salary.overtidMertid,
      overtidEnkel: salary.overtidEnkel,
      overtidKvalificerad: salary.overtidKvalificerad,
      totalOvertimePay: salary.totalOvertimePay,
      sickPay: salary.sickPay,
      grossBeforeVacation: salary.grossBeforeVacation,
      vacationPay: salary.vacationPay,
      vacationPayRate: salary.settings.vacationPayRate,
      includeVacationInSalary: includeVacation,
      grossPay: salary.grossPay,
      tax: salary.tax,
      taxRate: salary.settings.taxRate,
      taxMode: salary.settings.taxMode,
      taxTable: salary.settings.taxTable,
      netPay: salary.netPay,
    });
    doc.save(`lonebesked-${month}.pdf`);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Löneberäkning</h1>

      <div className="bg-white p-4 sm:p-6 rounded-lg shadow mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Utbetalningsmånad</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Användare</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Mig själv</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-3">
          Visar lön för arbetsperiod <strong>{getWorkMonth(month)}</strong>, utbetalas i slutet av <strong>{month}</strong>.
        </p>
      </div>

      {salary && (
        <div className="space-y-6">
          {/* PDF Export */}
          <div className="flex justify-end">
            <button
              onClick={exportPDF}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Exportera lönebesked (PDF)
            </button>
          </div>

          {/* New Summary Card */}
          <TotalSummaryCard
            salary={salary}
            month={getWorkMonth(month)}
            userName={salary.user.name}
            includeVacation={includeVacation}
            onToggleVacation={handleToggleVacation}
          />

          {/* Vacation Pay Tracker */}
          <VacationPayTracker refreshKey={vacationRefreshKey} />

          {/* Daily breakdown */}
          {salary.days.length > 0 && (
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
              <h2 className="text-lg font-semibold mb-4">Daglig uppdelning</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Typ</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Timmar</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Grundlön</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">OB</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Övertid</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Totalt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {salary.days.map((day) => {
                      const dayTotal = day.basePay + (day.obResult?.totalOBAmount ?? 0) + day.overtimePay + day.sickPay;
                      return (
                        <tr
                          key={day.date}
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => setExpandedDay(expandedDay === day.date ? null : day.date)}
                        >
                          <td className="px-3 py-2">{day.date}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              day.entryType === 'sick' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {day.entryType === 'sick' ? 'Sjuk' : 'Arbete'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">{day.hours.toFixed(1)}h</td>
                          <td className="px-3 py-2 text-right hidden sm:table-cell">{formatCurrency(day.basePay)}</td>
                          <td className="px-3 py-2 text-right hidden sm:table-cell">
                            {day.obResult && day.obResult.totalOBAmount > 0
                              ? formatCurrency(day.obResult.totalOBAmount)
                              : '-'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {day.overtimePay > 0 ? formatCurrency(day.overtimePay) : '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{formatCurrency(dayTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
