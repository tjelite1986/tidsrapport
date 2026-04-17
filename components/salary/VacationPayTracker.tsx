'use client';

import { useEffect, useState } from 'react';

interface MonthlyBreakdown {
  month: string;
  vacationPay: number;
  grossBeforeVacation: number;
}

interface YearlyBreakdown {
  year: number;
  sempiralYear: number;
  earned: number;
  months: MonthlyBreakdown[];
}

interface Withdrawal {
  id: number;
  amount: number;
  tax: number;
  netAmount: number;
  note: string | null;
  withdrawnAt: string;
}

interface VacationPayData {
  totalAccumulated: number;
  totalWithdrawn: number;
  totalTax: number;
  vacationDaysPaidOut: number;
  balance: number;
  vacationPayRate: number;
  taxMode: string;
  taxRate: number;
  taxTable: number | null;
  monthlyBreakdown: MonthlyBreakdown[];
  yearlyBreakdown: YearlyBreakdown[];
  withdrawals: Withdrawal[];
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(amount);
}

function formatMonth(month: string) {
  const [year, m] = month.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
  return `${months[parseInt(m) - 1]} ${year}`;
}

interface Props {
  refreshKey?: number;
}

export default function VacationPayTracker({ refreshKey }: Props) {
  const [data, setData] = useState<VacationPayData | null>(null);
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedYear, setExpandedYear] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, [refreshKey]);

  async function fetchData() {
    const res = await fetch('/api/vacation-pay');
    if (res.ok) setData(await res.json());
  }

  async function handleWithdraw() {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) return;
    setSaving(true);
    const res = await fetch('/api/vacation-pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseFloat(withdrawAmount), note: withdrawNote }),
    });
    if (res.ok) {
      setWithdrawAmount('');
      setWithdrawNote('');
      setShowWithdrawForm(false);
      fetchData();
    }
    setSaving(false);
  }

  // Estimate tax on a given amount for preview
  function estimateTax(amount: number): number {
    if (!data || !amount || amount <= 0) return 0;
    if (data.taxMode === 'table' && data.taxTable) {
      // Approximate: use tax rate as fallback since we can't call server-side lookup
      return amount * (data.taxRate / 100);
    }
    return amount * (data.taxRate / 100);
  }

  if (!data) return null;

  const previewAmount = parseFloat(withdrawAmount) || 0;
  const previewTax = estimateTax(previewAmount);
  const previewNet = previewAmount - previewTax;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-white">
        <h2 className="text-lg font-semibold mb-1">Semesterersättning</h2>
        <p className="text-amber-100 text-sm">{data.vacationPayRate}% på bruttolön</p>
      </div>

      {/* Balance overview */}
      <div className="p-6 border-b">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-xs text-gray-500 uppercase font-medium">Ackumulerat</div>
            <div className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(data.totalAccumulated)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase font-medium">Semesterlön</div>
            <div className="text-lg font-bold text-teal-600 mt-1">
              {data.vacationDaysPaidOut > 0 ? `-${formatCurrency(data.vacationDaysPaidOut)}` : formatCurrency(0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase font-medium">Manuellt uttag</div>
            <div className="text-lg font-bold text-red-600 mt-1">{formatCurrency(data.totalWithdrawn)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase font-medium">Saldo</div>
            <div className={`text-xl font-bold mt-1 ${data.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(data.balance)}
            </div>
          </div>
        </div>
      </div>

      {/* Yearly breakdown */}
      {data.yearlyBreakdown && data.yearlyBreakdown.length > 0 && (
        <div className="p-6 border-b">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Per intjänandeår</h3>
          <div className="space-y-3">
            {data.yearlyBreakdown.map((yb) => (
              <div key={yb.year} className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedYear(expandedYear === yb.year ? null : yb.year)}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition"
                >
                  <div className="text-left">
                    <span className="font-medium text-gray-800">Intjänat {yb.year}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      (för semester {yb.sempiralYear})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-amber-600">{formatCurrency(yb.earned)}</span>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${expandedYear === yb.year ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                {expandedYear === yb.year && (
                  <div className="border-t border-gray-200 px-3 py-2 bg-gray-50">
                    {yb.months.map((m) => (
                      <div key={m.month} className="flex items-center justify-between text-sm py-1">
                        <span className="text-gray-600">{formatMonth(m.month)}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">
                            på {formatCurrency(m.grossBeforeVacation)}
                          </span>
                          <span className="font-medium text-amber-600 w-24 text-right">
                            +{formatCurrency(m.vacationPay)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Withdrawals */}
      {data.withdrawals.length > 0 && (
        <div className="p-6 border-b">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Uttag</h3>
          <div className="space-y-3">
            {data.withdrawals.map((w) => (
              <div key={w.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="text-gray-600">
                      {new Date(w.withdrawnAt).toLocaleDateString('sv-SE')}
                    </span>
                    {w.note && <span className="text-gray-400 ml-2">— {w.note}</span>}
                  </div>
                  <span className="font-medium text-red-600">-{formatCurrency(w.amount)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
                  <span>Skatt: {formatCurrency(w.tax ?? 0)}</span>
                  <span>Utbetalt: <span className="text-gray-600 font-medium">{formatCurrency(w.netAmount ?? (w.amount - (w.tax ?? 0)))}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Withdraw button / form */}
      <div className="p-6">
        {!showWithdrawForm ? (
          <button
            onClick={() => setShowWithdrawForm(true)}
            className="w-full bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2.5 rounded-lg hover:bg-amber-100 transition text-sm font-medium"
          >
            Göra uttag
          </button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Belopp brutto (SEK)</label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
            {previewAmount > 0 && (
              <div className="bg-gray-50 rounded-md p-3 text-sm space-y-1">
                <div className="flex justify-between text-gray-600">
                  <span>Brutto</span>
                  <span>{formatCurrency(previewAmount)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Skatt ({data.taxMode === 'table' ? `tabell ${data.taxTable}` : `${data.taxRate}%`})</span>
                  <span className="text-red-500">-{formatCurrency(previewTax)}</span>
                </div>
                <div className="flex justify-between font-medium text-gray-800 border-t border-gray-200 pt-1">
                  <span>Utbetalas</span>
                  <span>{formatCurrency(previewNet)}</span>
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Anteckning (valfritt)</label>
              <input
                type="text"
                value={withdrawNote}
                onChange={(e) => setWithdrawNote(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="T.ex. semesteruttag juni"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleWithdraw}
                disabled={saving || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                className="flex-1 bg-amber-600 text-white px-4 py-2 rounded-md hover:bg-amber-700 disabled:opacity-50 text-sm font-medium"
              >
                {saving ? 'Sparar...' : 'Registrera uttag'}
              </button>
              <button
                onClick={() => { setShowWithdrawForm(false); setWithdrawAmount(''); setWithdrawNote(''); }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
              >
                Avbryt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
