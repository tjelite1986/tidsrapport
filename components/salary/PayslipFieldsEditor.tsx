'use client';

import { PAYSLIP_FIELDS, type PayslipNumberField } from '@/lib/payslips/fields';

export type FieldValues = Record<PayslipNumberField, string>;
export type ObRow = { percent: string; hours: string; amount: string };

export const EMPTY_FIELDS: FieldValues = PAYSLIP_FIELDS.reduce(
  (acc, field) => ({ ...acc, [field.key]: '' }),
  {} as FieldValues,
);

const GROUPS: { group: 'time' | 'earnings' | 'summary'; title: string; hint?: string }[] = [
  { group: 'time', title: 'Tid och timlön' },
  { group: 'earnings', title: 'Lönerader' },
  { group: 'summary', title: 'Summering' },
];

interface Props {
  values: FieldValues;
  obRows: ObRow[];
  onChange: (key: PayslipNumberField, value: string) => void;
  onObChange: (index: number, key: keyof ObRow, value: string) => void;
  onObAdd: (percent?: number) => void;
  onObRemove: (index: number) => void;
  /** Percentages the app's own calculation found for this month, as shortcuts. */
  suggestedPercents?: number[];
  compact?: boolean;
}

/**
 * Every payslip line item the app can compare against its own calculation.
 * All fields are optional — a spec where only gross/tax/net is typed in still
 * gives a useful comparison.
 */
export default function PayslipFieldsEditor({
  values,
  obRows,
  onChange,
  onObChange,
  onObAdd,
  onObRemove,
  suggestedPercents = [],
  compact,
}: Props) {
  const usedPercents = new Set(obRows.map((row) => row.percent.trim()));
  const shortcuts = suggestedPercents.filter((percent) => !usedPercents.has(String(percent)));

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      {GROUPS.map(({ group, title }) => (
        <div key={group}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PAYSLIP_FIELDS.filter((field) => field.group === group).map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {field.label}
                  {field.unit === 'hours' && ' (h)'}
                  {field.unit === 'count' && ' (st)'}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={values[field.key]}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>

          {group === 'earnings' && (
            <div className="mt-3 bg-orange-50 border border-orange-100 rounded-xl p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">OB per procentsats</p>
                <button
                  type="button"
                  onClick={() => onObAdd()}
                  className="text-xs px-2 py-1 rounded-md border border-orange-300 text-orange-700 hover:bg-orange-100"
                >
                  Lägg till OB-rad
                </button>
              </div>

              {obRows.length === 0 && (
                <p className="text-xs text-orange-700/80 mb-2">
                  Inga OB-rader ännu. Lägg till en rad per procentsats som står på specen.
                </p>
              )}

              <div className="space-y-2">
                {obRows.map((row, index) => (
                  <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end">
                    <div>
                      <label className="block text-[11px] text-orange-700 mb-1">Procent</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.percent}
                        onChange={(e) => onObChange(index, 'percent', e.target.value)}
                        placeholder="50"
                        className="w-full px-2 py-1.5 border border-orange-200 rounded-md text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-orange-700 mb-1">Timmar</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.hours}
                        onChange={(e) => onObChange(index, 'hours', e.target.value)}
                        placeholder="12,25"
                        className="w-full px-2 py-1.5 border border-orange-200 rounded-md text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-orange-700 mb-1">Belopp</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(e) => onObChange(index, 'amount', e.target.value)}
                        placeholder="1 076,00"
                        className="w-full px-2 py-1.5 border border-orange-200 rounded-md text-sm bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onObRemove(index)}
                      aria-label="Ta bort OB-raden"
                      className="px-2 py-1.5 rounded-md border border-orange-200 text-orange-700 hover:bg-orange-100 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {shortcuts.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-orange-700/80">
                  <span>Beräkningen har OB:</span>
                  {shortcuts.map((percent) => (
                    <button
                      key={percent}
                      type="button"
                      onClick={() => onObAdd(percent)}
                      className="px-2 py-0.5 rounded-full border border-orange-300 text-orange-700 hover:bg-orange-100"
                    >
                      + {percent}%
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
