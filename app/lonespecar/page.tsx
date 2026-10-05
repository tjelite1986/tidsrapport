'use client';

import { useCallback, useEffect, useState } from 'react';
import PayslipFieldsEditor, {
  EMPTY_FIELDS,
  type FieldValues,
  type ObRow,
} from '@/components/salary/PayslipFieldsEditor';
import {
  PAYSLIP_FIELDS,
  type ComparisonRow,
  type ObLine,
  type PayslipNumberField,
} from '@/lib/payslips/fields';

interface CalculatedPay {
  obBreakdown: { percent: number; hours: number; amount: number }[];
  [key: string]: unknown;
}

type PayslipRow = {
  id: number;
  payMonth: string;
  workMonth: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  obLines: ObLine[];
  note: string | null;
  uploadedAt: string;
  calculated: CalculatedPay | null;
  comparison: ComparisonRow[];
} & Record<PayslipNumberField, number | null>;

const MONTH_SV = [
  '', 'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];

/** The amounts a payslip always has — the AI reader flags these when missing. */
const CORE_FIELDS: PayslipNumberField[] = ['grossPay', 'tax', 'netPay'];

const GROUP_TITLES: Record<ComparisonRow['group'], string> = {
  time: 'Tid och timlön',
  earnings: 'Lönerader',
  summary: 'Summering',
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function formatValue(value: number, unit: ComparisonRow['unit']) {
  if (unit === 'currency') return formatCurrency(value);
  if (unit === 'rate') return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  if (unit === 'hours') return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(value)} h`;
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(value);
}

function formatDiff(amount: number, unit: ComparisonRow['unit']) {
  const money = unit === 'currency' || unit === 'rate';
  const formatted = new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: money ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount) < 0.005 ? 0 : Math.abs(amount));
  const suffix = unit === 'currency' ? ' kr' : unit === 'hours' ? ' h' : '';
  if (Math.abs(amount) < 0.005) return `${formatted}${suffix}`;
  return `${amount > 0 ? '+' : '−'}${formatted}${suffix}`;
}

/** How large a diff may be before it is flagged: up to 0.60 kr on amounts, otherwise any difference counts. */
function isMatch(diff: number, unit: ComparisonRow['unit']) {
  return Math.abs(diff) < (unit === 'currency' ? 0.605 : 0.005);
}

function formatMonth(month: string) {
  const [year, m] = month.split('-');
  return `${MONTH_SV[Number(m)]} ${year}`;
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

function formatNumberForInput(value: number | null | undefined) {
  if (value === null || value === undefined) return '';
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2, useGrouping: false }).format(value);
}

function fieldsFromRow(row: PayslipRow): FieldValues {
  const values = { ...EMPTY_FIELDS };
  for (const field of PAYSLIP_FIELDS) {
    values[field.key] = formatNumberForInput(row[field.key]);
  }
  return values;
}

function obRowsFromLines(lines: ObLine[]): ObRow[] {
  return lines.map((line) => ({
    percent: String(line.percent),
    hours: formatNumberForInput(line.hours),
    amount: formatNumberForInput(line.amount),
  }));
}

/** Blank rows carry no information — the server drops them, so do we. */
function obRowsToPayload(rows: ObRow[]) {
  return rows
    .filter((row) => row.percent.trim() && (row.hours.trim() || row.amount.trim()))
    .map((row) => ({ percent: row.percent, hours: row.hours, amount: row.amount }));
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
  const [fields, setFields] = useState<FieldValues>(EMPTY_FIELDS);
  const [obRows, setObRows] = useState<ObRow[]>([]);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [reading, setReading] = useState(false);
  const [aiInfo, setAiInfo] = useState<string | null>(null);

  // Inline edit
  const [editId, setEditId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<FieldValues>(EMPTY_FIELDS);
  const [editObRows, setEditObRows] = useState<ObRow[]>([]);
  const [editNote, setEditNote] = useState('');

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

  // OB percentages the calculation has seen — offered as shortcuts in the form
  const knownPercents = [
    ...new Set(payslips.flatMap((row) => row.calculated?.obBreakdown?.map((ob) => ob.percent) ?? [])),
  ].sort((a, b) => a - b);

  function resetForm() {
    setFile(null);
    setAiInfo(null);
    setFields(EMPTY_FIELDS);
    setObRows([]);
    setNote('');
    const input = document.getElementById('payslip-file') as HTMLInputElement | null;
    if (input) input.value = '';
  }

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
    for (const field of PAYSLIP_FIELDS) form.append(field.key, fields[field.key]);
    form.append('obLines', JSON.stringify(obRowsToPayload(obRows)));
    form.append('note', note);

    const res = await fetch('/api/payslips', { method: 'POST', body: form });
    setUploading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Uppladdningen misslyckades');
      return;
    }

    resetForm();

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

    const next = { ...EMPTY_FIELDS };
    let filled = 0;
    // Only the core amounts are reported as missing — a spec without overtime
    // has no overtime row, and listing every empty field reads as a failure.
    const missing: string[] = [];
    for (const field of PAYSLIP_FIELDS) {
      const value = data[field.key];
      const found = typeof value === 'number';
      next[field.key] = found ? formatNumberForInput(value) : '';
      if (found) filled += 1;
      else if (CORE_FIELDS.includes(field.key)) missing.push(field.label.toLowerCase());
    }
    setFields(next);
    const lines = Array.isArray(data.obLines) ? obRowsFromLines(data.obLines) : [];
    setObRows(lines);
    filled += lines.length;

    if (data.payMonth) setPayMonth(data.payMonth);
    else missing.unshift('utbetalningsmånad');

    const summary = `Avläst ${filled} ${filled === 1 ? 'rad' : 'rader'} — kontrollera värdena innan du sparar.`;
    setAiInfo(missing.length > 0 ? `${summary} Hittade inte: ${missing.join(', ')}.` : summary);
  }

  function startEdit(row: PayslipRow) {
    setEditId(row.id);
    setEditFields(fieldsFromRow(row));
    setEditObRows(obRowsFromLines(row.obLines));
    setEditNote(row.note ?? '');
  }

  async function saveEdit(id: number) {
    setError(null);
    const payload: Record<string, unknown> = { id, note: editNote, obLines: obRowsToPayload(editObRows) };
    for (const field of PAYSLIP_FIELDS) payload[field.key] = editFields[field.key];

    const res = await fetch('/api/payslips', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-500 mb-3">
            Beloppen är valfria — fyll i de rader du vill jämföra mot appens beräkning.
          </p>
          <PayslipFieldsEditor
            values={fields}
            obRows={obRows}
            suggestedPercents={knownPercents}
            onChange={(key, value) => setFields((prev) => ({ ...prev, [key]: value }))}
            onObChange={(index, key, value) =>
              setObRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
            }
            onObAdd={(percent) =>
              setObRows((prev) => [...prev, { percent: percent ? String(percent) : '', hours: '', amount: '' }])
            }
            onObRemove={(index) => setObRows((prev) => prev.filter((_, i) => i !== index))}
          />
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
                <div className="mt-4 space-y-4">
                  <PayslipFieldsEditor
                    compact
                    values={editFields}
                    obRows={editObRows}
                    suggestedPercents={row.calculated?.obBreakdown?.map((ob) => ob.percent) ?? []}
                    onChange={(key, value) => setEditFields((prev) => ({ ...prev, [key]: value }))}
                    onObChange={(index, key, value) =>
                      setEditObRows((prev) => prev.map((r, i) => (i === index ? { ...r, [key]: value } : r)))
                    }
                    onObAdd={(percent) =>
                      setEditObRows((prev) => [...prev, { percent: percent ? String(percent) : '', hours: '', amount: '' }])
                    }
                    onObRemove={(index) => setEditObRows((prev) => prev.filter((_, i) => i !== index))}
                  />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Anteckning</label>
                    <input
                      type="text"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                  <button
                    onClick={() => saveEdit(row.id)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium"
                  >
                    Spara
                  </button>
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
                      {(['time', 'earnings', 'summary'] as const).flatMap((group) => {
                        const groupRows = row.comparison.filter((item) => item.group === group);
                        if (groupRows.length === 0) return [];
                        return [
                          <tr key={`${group}-header`} className="bg-gray-50/70">
                            <td colSpan={4} className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              {GROUP_TITLES[group]}
                            </td>
                          </tr>,
                          ...groupRows.map((item) => (
                            <tr key={item.key}>
                              <td className="px-3 py-2">{item.label}</td>
                              <td className="px-3 py-2 text-right">
                                {item.actual === null
                                  ? <span className="text-gray-400">–</span>
                                  : formatValue(item.actual, item.unit)}
                              </td>
                              <td className="px-3 py-2 text-right text-gray-600">
                                {item.calculated === null
                                  ? <span className="text-gray-400">–</span>
                                  : formatValue(item.calculated, item.unit)}
                              </td>
                              <td
                                className={`px-3 py-2 text-right font-medium ${
                                  item.diff === null
                                    ? 'text-gray-400'
                                    : isMatch(item.diff, item.unit)
                                      ? 'text-green-600'
                                      : 'text-amber-600'
                                }`}
                              >
                                {item.diff === null ? '–' : formatDiff(item.diff, item.unit)}
                              </td>
                            </tr>
                          )),
                        ];
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
