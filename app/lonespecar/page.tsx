'use client';

import { useCallback, useEffect, useState } from 'react';

interface PayslipRow {
  id: number;
  payMonth: string;
  workMonth: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  grossPay: number | null;
  tax: number | null;
  netPay: number | null;
  note: string | null;
  uploadedAt: string;
  calculated: { grossPay: number; tax: number; netPay: number } | null;
  diff: { grossPay: number | null; tax: number | null; netPay: number | null } | null;
}

const MONTH_SV = [
  '', 'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount);
}

function formatDiff(amount: number) {
  const formatted = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Math.abs(amount));
  if (Math.round(amount) === 0) return '0 kr';
  return `${amount > 0 ? '+' : '−'}${formatted} kr`;
}

function formatMonth(month: string) {
  const [year, m] = month.split('-');
  return `${MONTH_SV[Number(m)]} ${year}`;
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

export default function LonespecarPage() {
  const [payslips, setPayslips] = useState<PayslipRow[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [year, setYear] = useState<number | 'all'>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload form
  const [file, setFile] = useState<File | null>(null);
  const [payMonth, setPayMonth] = useState(currentMonth);
  const [grossPay, setGrossPay] = useState('');
  const [tax, setTax] = useState('');
  const [netPay, setNetPay] = useState('');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [reading, setReading] = useState(false);
  const [aiInfo, setAiInfo] = useState<string | null>(null);

  // Inline edit
  const [editId, setEditId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState({ grossPay: '', tax: '', netPay: '', note: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const query = year === 'all' ? '' : `?year=${year}`;
    const res = await fetch(`/api/payslips${query}`);
    if (res.ok) {
      const data = await res.json();
      setPayslips(data.payslips);
      setYears(data.years);
      setAiEnabled(Boolean(data.aiEnabled));
    } else {
      setError('Kunde inte hämta lönespecar');
    }
    setLoading(false);
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Välj en fil först');
      return;
    }
    setUploading(true);
    setError(null);

    const form = new FormData();
    form.append('file', file);
    form.append('payMonth', payMonth);
    form.append('grossPay', grossPay);
    form.append('tax', tax);
    form.append('netPay', netPay);
    form.append('note', note);

    const res = await fetch('/api/payslips', { method: 'POST', body: form });
    setUploading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Uppladdningen misslyckades');
      return;
    }

    setFile(null);
    setAiInfo(null);
    setGrossPay('');
    setTax('');
    setNetPay('');
    setNote('');
    const input = document.getElementById('payslip-file') as HTMLInputElement | null;
    if (input) input.value = '';

    const uploadedYear = Number(payMonth.slice(0, 4));
    if (year !== 'all' && year !== uploadedYear) setYear(uploadedYear);
    else load();
  }

  async function readWithAi() {
    if (!file) return;
    setReading(true);
    setError(null);
    setAiInfo(null);

    const form = new FormData();
    form.append('file', file);

    const res = await fetch('/api/payslips/extract', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    setReading(false);

    if (!res.ok) {
      setError(data.error ?? 'AI-avläsningen misslyckades');
      return;
    }

    const format = (value: number | null) =>
      value === null ? '' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(value);

    const missing: string[] = [];
    if (data.payMonth) setPayMonth(data.payMonth);
    else missing.push('utbetalningsmånad');
    if (data.grossPay === null) missing.push('bruttolön');
    if (data.tax === null) missing.push('skatt');
    if (data.netPay === null) missing.push('nettolön');

    setGrossPay(format(data.grossPay));
    setTax(format(data.tax));
    setNetPay(format(data.netPay));

    setAiInfo(
      missing.length > 0
        ? `Avläst — kontrollera värdena. Hittade inte: ${missing.join(', ')}.`
        : 'Avläst — kontrollera värdena innan du sparar.',
    );
  }

  function startEdit(row: PayslipRow) {
    setEditId(row.id);
    setEditValues({
      grossPay: row.grossPay?.toString() ?? '',
      tax: row.tax?.toString() ?? '',
      netPay: row.netPay?.toString() ?? '',
      note: row.note ?? '',
    });
  }

  async function saveEdit(id: number) {
    setError(null);
    const res = await fetch('/api/payslips', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...editValues }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Kunde inte spara');
      return;
    }
    setEditId(null);
    load();
  }

  async function remove(row: PayslipRow) {
    if (!confirm(`Radera lönespecen för ${formatMonth(row.payMonth)}? Filen tas bort permanent.`)) return;
    const res = await fetch(`/api/payslips?id=${row.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('Kunde inte radera lönespecen');
      return;
    }
    load();
  }

  const yearOptions = years.includes(new Date().getFullYear()) ? years : [new Date().getFullYear(), ...years];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Lönespecar</h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Upload */}
      <form onSubmit={handleUpload} className="bg-white p-4 sm:p-6 rounded-lg shadow mb-6 space-y-4">
        <h2 className="text-lg font-semibold">Ladda upp lönespec</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Utbetalningsmånad</label>
            <input
              type="month"
              value={payMonth}
              onChange={(e) => setPayMonth(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Avser arbetsperiod <strong>{payMonth ? formatMonth(monthBefore(payMonth)) : '–'}</strong>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fil (PDF, PNG, JPG, WEBP)</label>
            <input
              id="payslip-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setAiInfo(null);
              }}
              className="w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bruttolön (valfritt)</label>
            <input
              type="text"
              inputMode="decimal"
              value={grossPay}
              onChange={(e) => setGrossPay(e.target.value)}
              placeholder="32 450,00"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Skatt (valfritt)</label>
            <input
              type="text"
              inputMode="decimal"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              placeholder="8 332,00"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nettolön (valfritt)</label>
            <input
              type="text"
              inputMode="decimal"
              value={netPay}
              onChange={(e) => setNetPay(e.target.value)}
              placeholder="24 118,00"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Anteckning (valfritt)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="T.ex. retroaktiv justering, bonus"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {aiInfo && (
          <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-2 text-sm text-blue-800">
            {aiInfo}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={uploading || reading || !file}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {uploading ? 'Laddar upp…' : 'Ladda upp'}
          </button>
          {aiEnabled && (
            <button
              type="button"
              onClick={readWithAi}
              disabled={reading || uploading || !file}
              className="border border-blue-600 text-blue-700 px-4 py-2 rounded-md hover:bg-blue-50 disabled:opacity-50 text-sm font-medium flex items-center gap-2"
            >
              {reading ? 'Läser av…' : 'Läs av med AI'}
            </button>
          )}
          <p className="text-xs text-gray-500">
            Max 10 MB. Beloppen kan fyllas i senare{aiEnabled ? ' eller läsas av från specen' : ''}.
          </p>
        </div>
      </form>

      {/* Year filter */}
      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm font-medium text-gray-700">År</label>
        <select
          value={year === 'all' ? 'all' : String(year)}
          onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
          <option value="all">Alla år</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-gray-500">Laddar…</p>
      ) : payslips.length === 0 ? (
        <div className="bg-white p-6 rounded-lg shadow text-gray-500 text-sm">
          Inga lönespecar sparade{year === 'all' ? '' : ` för ${year}`} ännu.
        </div>
      ) : (
        <div className="space-y-4">
          {payslips.map((row) => (
            <div key={row.id} className="bg-white rounded-lg shadow p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{formatMonth(row.payMonth)}</h3>
                  <p className="text-sm text-gray-500">
                    Arbetsperiod {formatMonth(row.workMonth)} · {row.originalName} · {formatSize(row.sizeBytes)}
                  </p>
                  {row.note && <p className="text-sm text-gray-600 mt-1">{row.note}</p>}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <a
                    href={`/api/payslips/${row.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50"
                  >
                    Öppna
                  </a>
                  <a
                    href={`/api/payslips/${row.id}/file?download=1`}
                    className="px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50"
                  >
                    Ladda ner
                  </a>
                  <button
                    onClick={() => (editId === row.id ? setEditId(null) : startEdit(row))}
                    className="px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50"
                  >
                    {editId === row.id ? 'Avbryt' : 'Redigera'}
                  </button>
                  <button
                    onClick={() => remove(row)}
                    className="px-3 py-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Radera
                  </button>
                </div>
              </div>

              {editId === row.id ? (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
                  {(['grossPay', 'tax', 'netPay'] as const).map((field) => (
                    <div key={field}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        {field === 'grossPay' ? 'Bruttolön' : field === 'tax' ? 'Skatt' : 'Nettolön'}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editValues[field]}
                        onChange={(e) => setEditValues({ ...editValues, [field]: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Anteckning</label>
                    <input
                      type="text"
                      value={editValues.note}
                      onChange={(e) => setEditValues({ ...editValues, note: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <button
                      onClick={() => saveEdit(row.id)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium"
                    >
                      Spara
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Post</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Enligt spec</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Beräknat</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Diff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {(['grossPay', 'tax', 'netPay'] as const).map((field) => {
                        const actual = row[field];
                        const calculated = row.calculated?.[field] ?? null;
                        const diff = row.diff?.[field] ?? null;
                        const label = field === 'grossPay' ? 'Bruttolön' : field === 'tax' ? 'Skatt' : 'Nettolön';
                        return (
                          <tr key={field}>
                            <td className="px-3 py-2">{label}</td>
                            <td className="px-3 py-2 text-right">
                              {actual === null ? <span className="text-gray-400">–</span> : formatCurrency(actual)}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600">
                              {calculated === null ? <span className="text-gray-400">–</span> : formatCurrency(calculated)}
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-medium ${
                                diff === null
                                  ? 'text-gray-400'
                                  : Math.abs(diff) < 1
                                    ? 'text-green-600'
                                    : 'text-amber-600'
                              }`}
                            >
                              {diff === null ? '–' : formatDiff(diff)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {row.grossPay === null && row.tax === null && row.netPay === null && (
                    <p className="mt-2 text-xs text-gray-500">
                      Fyll i beloppen från specen med <strong>Redigera</strong> för att jämföra mot appens beräkning.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Same mapping as the server: a payout month pays for the month before. */
function monthBefore(month: string) {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
