'use client';

interface OBBreakdownItem {
  percent: number;
  hours: number;
  amount: number;
}

interface SalaryData {
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
  vacationDaysPay: number;
  vacationDaysCount: number;
  grossPay: number;
  tax: number;
  netPay: number;
  hourlyRate: number;
  settings: {
    vacationPayRate: number;
    vacationPayMode: string;
    taxRate: number;
    taxMode?: string;
    taxTable?: number | null;
  };
}

interface Props {
  salary: SalaryData;
  month: string;
  userName: string;
  includeVacation: boolean;
  onToggleVacation: () => void;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(amount);
}

export default function TotalSummaryCard({ salary, month, userName, includeVacation, onToggleVacation }: Props) {
  const gross = salary.grossBeforeVacation;
  const baseW = gross > 0 ? (salary.basePay / gross) * 100 : 0;
  const obW = gross > 0 ? (salary.totalOB / gross) * 100 : 0;
  const otW = gross > 0 ? (salary.totalOvertimePay / gross) * 100 : 0;
  const sickW = gross > 0 ? (salary.sickPay / gross) * 100 : 0;

  const taxMode = salary.settings.taxMode === 'table' && salary.settings.taxTable;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-5 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Lönesammanfattning</p>
            <h2 className="text-xl font-bold mt-0.5">{userName}</h2>
            <p className="text-slate-400 text-sm mt-0.5">{month}</p>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-xs">Nettolön</p>
            <p className="text-2xl font-bold text-emerald-400 mt-0.5">{formatCurrency(salary.netPay)}</p>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        {/* Visual breakdown bar */}
        {gross > 0 && (
          <div>
            <div className="flex rounded-full overflow-hidden h-2.5 mb-3">
              {baseW > 0 && <div className="bg-blue-500" style={{ width: `${baseW}%` }} />}
              {obW > 0 && <div className="bg-orange-400" style={{ width: `${obW}%` }} />}
              {otW > 0 && <div className="bg-amber-400" style={{ width: `${otW}%` }} />}
              {sickW > 0 && <div className="bg-red-400" style={{ width: `${sickW}%` }} />}
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <LegendDot color="bg-blue-500" label="Grundlön" />
              {salary.totalOB > 0 && <LegendDot color="bg-orange-400" label="OB" />}
              {salary.totalOvertimePay > 0 && <LegendDot color="bg-amber-400" label="Övertid" />}
              {salary.sickPay > 0 && <LegendDot color="bg-red-400" label="Sjuklön" />}
            </div>
          </div>
        )}

        {/* Work time */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox label="Total tid" value={`${salary.totalHours.toFixed(2)}h`} />
          <StatBox label="Arbetad tid" value={`${salary.workHours.toFixed(2)}h`} />
          <StatBox label="Timlön" value={formatCurrency(salary.hourlyRate)} />
          {salary.sickDays > 0
            ? <StatBox label="Sjukdagar" value={String(salary.sickDays)} highlight="red" />
            : <StatBox label="Sjukdagar" value="0" />}
        </div>

        <div className="border-t border-gray-100" />

        {/* Line items */}
        <div className="space-y-2">
          <LineRow
            label="Grundlön"
            sub={`${salary.workHours.toFixed(2)}h × ${formatCurrency(salary.hourlyRate)}`}
            value={formatCurrency(salary.basePay)}
          />

          {/* OB */}
          {salary.obBreakdown && salary.obBreakdown.length > 0 && (
            <div className="bg-orange-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">OB-tillägg</p>
              {salary.obBreakdown.map((ob) => (
                <div key={ob.percent} className="flex justify-between text-sm py-0.5">
                  <span className="text-orange-700">OB {ob.percent}% · {ob.hours.toFixed(2)}h</span>
                  <span className="font-semibold text-orange-800">{formatCurrency(ob.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold border-t border-orange-200 pt-1.5 mt-1.5 text-orange-800">
                <span>Totalt OB</span>
                <span>{formatCurrency(salary.totalOB)}</span>
              </div>
            </div>
          )}

          {/* Overtime */}
          {salary.totalOvertimePay > 0 && (
            <div className="bg-amber-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Övertid / Mertid</p>
              {salary.overtidMertid > 0 && (
                <LineRow label="Mertid (+35%)" value={formatCurrency(salary.overtidMertid)} small />
              )}
              {salary.overtidEnkel > 0 && (
                <LineRow label="Enkel övertid (+35%)" value={formatCurrency(salary.overtidEnkel)} small />
              )}
              {salary.overtidKvalificerad > 0 && (
                <LineRow label="Kvalificerad övertid (+70%)" value={formatCurrency(salary.overtidKvalificerad)} small />
              )}
            </div>
          )}

          {/* Sick pay */}
          {salary.sickPay > 0 && (
            <LineRow label="Sjuklön (80%)" value={formatCurrency(salary.sickPay)} />
          )}

          {/* Vacation day pay (semesterlön från föregående års pot) */}
          {salary.vacationDaysPay > 0 && (
            <div className="bg-teal-50 rounded-xl p-3">
              <LineRow
                label={`Semesterlön (${salary.vacationDaysCount} dag${salary.vacationDaysCount !== 1 ? 'ar' : ''})`}
                sub={`${formatCurrency(salary.vacationDaysPay / salary.vacationDaysCount)}/dag från föregående års pot`}
                value={formatCurrency(salary.vacationDaysPay)}
                teal
              />
            </div>
          )}

          <div className="border-t border-gray-100" />
          <LineRow label="Bruttolön" value={formatCurrency(salary.grossBeforeVacation)} bold />

          {/* Vacation pay */}
          <div className="flex justify-between items-center gap-2 py-1">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-gray-600 text-sm">Semesterersättning ({salary.settings.vacationPayRate}%)</span>
              {salary.settings.vacationPayMode === 'separate' ? (
                <button
                  onClick={onToggleVacation}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    includeVacation
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200'
                      : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {includeVacation ? 'Inkluderad' : 'Inkludera i lön'}
                </button>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                  Inkluderad i timlön
                </span>
              )}
            </div>
            <div className="text-right shrink-0">
              <span className={`font-medium text-sm whitespace-nowrap ${
                salary.settings.vacationPayMode === 'separate' && !includeVacation ? 'text-gray-400' : ''
              }`}>
                {formatCurrency(salary.vacationPay)}
              </span>
              {salary.settings.vacationPayMode === 'separate' && !includeVacation && (
                <p className="text-xs text-gray-400 mt-0.5">→ semesterpotten</p>
              )}
            </div>
          </div>

          {includeVacation && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-xs text-emerald-700">
              Semesterersättning inkluderas i bruttolönen och skattas denna månad.
            </div>
          )}

          {salary.vacationPay > 0 && includeVacation && (
            <LineRow label="Total före skatt" value={formatCurrency(salary.grossPay)} bold />
          )}

          <LineRow
            label={taxMode ? `Skatt (tabell ${salary.settings.taxTable})` : `Skatt (${salary.settings.taxRate}%)`}
            value={`−${formatCurrency(salary.tax)}`}
            red
          />
        </div>

        {/* Net pay */}
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Nettolön</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {taxMode ? `Skatteavdrag tabell ${salary.settings.taxTable}` : `${salary.settings.taxRate}% i skatt`}
            </p>
          </div>
          <p className="text-3xl font-bold text-emerald-600">{formatCurrency(salary.netPay)}</p>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  const textColor = highlight === 'red' ? 'text-red-600' : 'text-slate-700';
  return (
    <div className="bg-gray-50 rounded-xl p-3 text-center">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-base font-bold ${textColor}`}>{value}</p>
    </div>
  );
}

function LineRow({
  label, sub, value, bold, small, red, teal,
}: {
  label: string;
  sub?: string;
  value: React.ReactNode;
  bold?: boolean;
  small?: boolean;
  red?: boolean;
  teal?: boolean;
}) {
  return (
    <div className={`flex justify-between items-baseline ${small ? 'py-0.5' : 'py-1'}`}>
      <div className="min-w-0 mr-2">
        <span className={`${bold ? 'font-semibold text-gray-800' : teal ? 'text-teal-700' : 'text-gray-600'} ${small ? 'text-sm' : ''}`}>
          {label}
        </span>
        {sub && <span className="text-xs text-gray-400 ml-1.5">{sub}</span>}
      </div>
      <span
        className={`shrink-0 ${bold ? 'font-bold text-gray-800' : 'font-medium text-gray-700'} ${small ? 'text-sm' : ''} ${red ? 'text-red-500' : ''} ${teal ? 'text-teal-700' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1 text-gray-500">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </div>
  );
}
