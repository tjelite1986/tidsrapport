'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Collapsible from '@/components/ui/Collapsible';
import {
  detailGroups,
  diffStatus,
  formatDiff,
  headlineRows,
  monthBadge,
  type DiffStatus,
} from '@/lib/payslips/compare-view';
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
  const [showAmounts, setShowAmounts] = useState(false);

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
    setShowAmounts(true);
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

  const filledCount = Object.values(fields).filter((v) => v.trim() !== '').length + obRowsToPayload(obRows).length;

  const yearOptions = years.includes(new Date().getFullYear()) ? years : [new Date().getFullYear(), ...years];

  return (
    <div>
      <PageHeader title="Lönespecar" />

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Upload */}
      <Collapsible
        title="Ladda upp lönespec"
        description="PDF eller bild. Beloppen är valfria och kan fyllas i senare."
        defaultOpen={false}
        className="mb-6"
      >
        <form onSubmit={handleUpload} className="space-y-5">
          <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <legend className="sr-only">Fil och månad</legend>
            <div>
              <label htmlFor="payslip-month" className="field-label">Utbetalningsmånad</label>
              <input
                id="payslip-month"
                type="month"
                value={payMonth}
                onChange={(e) => setPayMonth(e.target.value)}
                required
                className="field"
              />
              <p className="mt-1 text-xs text-slate-500">
                Avser arbetsperiod <strong>{payMonth ? formatMonth(monthBefore(payMonth)) : '–'}</strong>
              </p>
            </div>

            <div>
              <label htmlFor="payslip-file" className="field-label">Fil (PDF, PNG, JPG, WEBP)</label>
              <input
                id="payslip-file"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setAiInfo(null);
                }}
                className="w-full text-sm text-slate-700 file:mr-3 file:min-h-[44px] file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100"
              />
              <p className="mt-1 text-xs text-slate-500">
                Max 10 MB.{aiEnabled ? ' Beloppen kan läsas av med AI.' : ''}
              </p>
            </div>
          </fieldset>

          {aiEnabled && (
            <button
              type="button"
              onClick={readWithAi}
              disabled={reading || uploading || !file}
              className="btn btn-accent w-full sm:w-auto"
            >
              {reading ? 'Läser av…' : 'Läs av med AI'}
            </button>
          )}

          {aiInfo && (
            <div role="status" className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-2 text-sm text-blue-800">
              {aiInfo}
            </div>
          )}

          <fieldset className="rounded-xl border border-slate-200 overflow-hidden">
            <legend className="sr-only">Belopp att jämföra</legend>
            <button
              type="button"
              aria-expanded={showAmounts}
              aria-controls="payslip-amounts"
              onClick={() => setShowAmounts((v) => !v)}
              className="w-full min-h-[48px] flex items-center justify-between gap-3 px-4 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span>
                Belopp från specen <span className="font-normal text-slate-500">(valfritt{filledCount > 0 ? `, ${filledCount} ifyllda` : ''})</span>
              </span>
              <span aria-hidden className={`text-slate-400 transition-transform motion-reduce:transition-none ${showAmounts ? 'rotate-180' : ''}`}>▾</span>
            </button>
            <div id="payslip-amounts" hidden={!showAmounts} className="border-t border-slate-200 p-4">
              <p className="text-sm text-slate-500 mb-3">
                Fyll i de rader du vill jämföra mot appens beräkning.
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
          </fieldset>

          <div>
            <label htmlFor="payslip-note" className="field-label">Anteckning (valfritt)</label>
            <input
              id="payslip-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="T.ex. retroaktiv justering, bonus"
              className="field"
            />
          </div>

          <button
            type="submit"
            disabled={uploading || reading || !file}
            className="btn btn-primary btn-3d w-full sm:w-auto px-6"
          >
            {uploading ? 'Laddar upp…' : 'Ladda upp'}
          </button>
        </form>
      </Collapsible>

      {/* Year filter */}
      <div className="flex items-center gap-3 mb-4">
        <label htmlFor="payslip-year" className="text-sm font-medium text-slate-700">År</label>
        <select
          id="payslip-year"
          value={year === 'all' ? 'all' : String(year)}
          onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="field !w-auto"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
          <option value="all">Alla år</option>
        </select>
        {!loading && payslips.length > 0 && (
          <span className="text-sm text-slate-500">{payslips.length} {payslips.length === 1 ? 'lönespec' : 'lönespecar'}</span>
        )}
      </div>

      {/* List */}
      {loading ? (
        <p role="status" className="text-slate-500">Laddar…</p>
      ) : payslips.length === 0 ? (
        <div className="surface p-6 text-slate-500 text-sm">
          Inga lönespecar sparade{year === 'all' ? '' : ` för ${year}`} ännu.
        </div>
      ) : (
        <div className="space-y-4">
          {payslips.map((row) => {
            const badge = monthBadge(row.comparison);
            const headline = headlineRows(row.comparison);
            const groups = detailGroups(row.comparison);
            return (
            <article key={row.id} aria-labelledby={`payslip-${row.id}`} className="surface p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 id={`payslip-${row.id}`} className="text-lg font-semibold capitalize">{formatMonth(row.payMonth)}</h3>
                    {badge.kind === 'off' ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        {badge.count} {badge.count === 1 ? 'avvikelse' : 'avvikelser'}
                      </span>
                    ) : badge.kind === 'match' ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">Stämmer</span>
                    ) : badge.kind === 'partial' ? (
                      <span title="Bara en del av raderna kunde jämföras" className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">Delvis</span>
                    ) : null}
                  </div>
                  <p className="text-sm text-slate-500 break-words">
                    Arbetsperiod {formatMonth(row.workMonth)} · {row.originalName} · {formatSize(row.sizeBytes)}
                  </p>
                  {row.note && <p className="text-sm text-slate-600 mt-1 break-words">{row.note}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end sm:shrink-0">
                  <a href={`/api/payslips/${row.id}/file`} target="_blank" rel="noreferrer" className="btn btn-secondary">
                    Öppna
                  </a>
                  <a href={`/api/payslips/${row.id}/file?download=1`} className="btn btn-secondary">
                    Ladda ner
                  </a>
                  <button
                    onClick={() => (editId === row.id ? setEditId(null) : startEdit(row))}
                    aria-expanded={editId === row.id}
                    className="btn btn-secondary"
                  >
                    {editId === row.id ? 'Avbryt' : 'Redigera'}
                  </button>
                  <button onClick={() => remove(row)} className="btn btn-danger">
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
                    <label htmlFor={`payslip-note-${row.id}`} className="field-label">Anteckning</label>
                    <input
                      id={`payslip-note-${row.id}`}
                      type="text"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      className="field"
                    />
                  </div>
                  <button onClick={() => saveEdit(row.id)} className="btn btn-primary btn-3d w-full sm:w-auto px-6">
                    Spara
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {/* Headline: gross, tax, net as comparison cards */}
                  {headline.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {headline.map((item) => (
                        <CompareCard key={item.key} item={item} />
                      ))}
                    </div>
                  )}

                  {groups.length > 0 && (
                    <>
                      {/* Phones: one block per row, values stacked under the label */}
                      <div className="md:hidden space-y-4">
                        {groups.map(({ group, rows }) => (
                          <section key={group} aria-label={GROUP_TITLES[group]}>
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{GROUP_TITLES[group]}</h4>
                            <ul className="divide-y divide-gray-200 border-y border-gray-200">
                              {rows.map((item) => (
                                <li key={item.key} className="py-2.5">
                                  <div className="flex items-baseline justify-between gap-3">
                                    <span className="text-sm font-medium text-slate-800">{item.label}</span>
                                    <DiffText item={item} className="text-sm" />
                                  </div>
                                  <dl className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-slate-500">
                                    <div className="flex gap-1"><dt>Spec</dt><dd className="text-slate-700">{valueOrDash(item.actual, item.unit)}</dd></div>
                                    <div className="flex gap-1"><dt>Beräknat</dt><dd className="text-slate-700">{valueOrDash(item.calculated, item.unit)}</dd></div>
                                  </dl>
                                </li>
                              ))}
                            </ul>
                          </section>
                        ))}
                      </div>

                      {/* Tablet and up: the full table */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Post</th>
                              <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Enligt spec</th>
                              <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Beräknat</th>
                              <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Diff</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {groups.flatMap(({ group, rows }) => [
                              <tr key={`${group}-header`} className="bg-gray-50/70">
                                <th scope="colgroup" colSpan={4} className="px-3 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                  {GROUP_TITLES[group]}
                                </th>
                              </tr>,
                              ...rows.map((item) => (
                                <tr key={item.key}>
                                  <td className="px-3 py-2">{item.label}</td>
                                  <td className="px-3 py-2 text-right">{valueOrDash(item.actual, item.unit)}</td>
                                  <td className="px-3 py-2 text-right text-gray-600">{valueOrDash(item.calculated, item.unit)}</td>
                                  <td className="px-3 py-2 text-right"><DiffText item={item} /></td>
                                </tr>
                              )),
                            ])}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {row.grossPay === null && row.tax === null && row.netPay === null && (
                    <p className="text-xs text-slate-500">
                      Fyll i beloppen från specen med <strong>Redigera</strong> för att jämföra mot appens beräkning.
                    </p>
                  )}
                </div>
              )}
            </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<DiffStatus, string> = {
  match: 'text-green-600',
  off: 'text-amber-600',
  none: 'text-gray-400',
};

function valueOrDash(value: number | null, unit: ComparisonRow['unit']) {
  return value === null ? <span className="text-gray-400">–</span> : formatValue(value, unit);
}

function DiffText({ item, className = '' }: { item: ComparisonRow; className?: string }) {
  const status = diffStatus(item);
  return (
    <span className={`font-medium tabular-nums ${STATUS_TEXT[status]} ${className}`}>
      {item.diff === null ? '–' : formatDiff(item.diff, item.unit)}
      {status !== 'none' && <span className="sr-only">{status === 'match' ? ' (stämmer)' : ' (avviker)'}</span>}
    </span>
  );
}

/** Calculated vs actual vs delta for one headline amount (gross, tax, net). */
function CompareCard({ item }: { item: ComparisonRow }) {
  const status = diffStatus(item);
  const edge = status === 'off' ? 'border-l-amber-500' : status === 'match' ? 'border-l-green-500' : 'border-l-slate-300';
  return (
    <div className={`rounded-xl border border-gray-200 border-l-4 ${edge} bg-gray-50 p-3`}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{item.label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{valueOrDash(item.actual, item.unit)}</p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-slate-500">Beräknat</dt>
          <dd className="font-medium tabular-nums text-slate-700">{valueOrDash(item.calculated, item.unit)}</dd>
        </div>
        <div className="text-right">
          <dt className="text-slate-500">Diff</dt>
          <dd><DiffText item={item} /></dd>
        </div>
      </dl>
    </div>
  );
}

/** Same mapping as the server: a payout month pays for the month before. */
function monthBefore(month: string) {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(year, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
