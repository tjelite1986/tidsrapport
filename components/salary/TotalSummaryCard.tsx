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
  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 sm:p-6 text-white">
        <h2 className="text-xl font-bold">Lönesammanfattning</h2>
        <p className="text-blue-100 text-sm">{userName} - {month}</p>
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {/* Work time section */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Arbetstid</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox label="Total tid" value={`${salary.totalHours.toFixed(1)}h`} />
            <StatBox label="Arbetad tid" value={`${salary.workHours.toFixed(1)}h`} />
            <StatBox label="Timlön" value={formatCurrency(salary.hourlyRate)} />
            {salary.sickDays > 0 && <StatBox label="Sjukdagar" value={String(salary.sickDays)} color="red" />}
          </div>
        </div>

        <div className="border-t" />

        {/* Base pay */}
        <Row label="Grundlön" sublabel={`${salary.workHours.toFixed(1)}h × ${formatCurrency(salary.hourlyRate)}`} value={formatCurrency(salary.basePay)} />

        {/* OB breakdown */}
        {salary.obBreakdown && salary.obBreakdown.length > 0 && (
          <div className="bg-orange-50 rounded-lg p-3">
            <div className="text-sm font-medium text-orange-800 mb-1">OB-tillägg</div>
            {salary.obBreakdown.map((ob) => (
              <div key={ob.percent} className="flex justify-between text-sm py-0.5">
                <span className="text-orange-700">OB {ob.percent}% ({ob.hours.toFixed(1)}h)</span>
                <span className="font-medium text-orange-800">{formatCurrency(ob.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-semibold border-t border-orange-200 pt-1 mt-1">
              <span className="text-orange-800">Totalt OB</span>
              <span className="text-orange-800">{formatCurrency(salary.totalOB)}</span>
            </div>
          </div>
        )}

        {/* Overtime */}
        {salary.totalOvertimePay > 0 && (
          <div className="bg-amber-50 rounded-lg p-3">
            <div className="text-sm font-medium text-amber-800 mb-1">Övertid/Mertid</div>
            {salary.overtidMertid > 0 && (
              <Row label="Mertid (+35%)" value={formatCurrency(salary.overtidMertid)} small />
            )}
            {salary.overtidEnkel > 0 && (
              <Row label="Enkel övertid (+35%)" value={formatCurrency(salary.overtidEnkel)} small />
            )}
            {salary.overtidKvalificerad > 0 && (
              <Row label="Kvalificerad övertid (+70%)" value={formatCurrency(salary.overtidKvalificerad)} small />
            )}
          </div>
        )}

        {/* Sick pay */}
        {salary.sickPay > 0 && (
          <Row label="Sjuklön (80%)" value={formatCurrency(salary.sickPay)} />
        )}

        <div className="border-t" />

        {/* Gross */}
        <Row label="Bruttolön" value={formatCurrency(salary.grossBeforeVacation)} bold />

        {/* Vacation pay med toggle */}
        <div className="flex justify-between items-start gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-gray-600">Semesterersättning ({salary.settings.vacationPayRate}%)</span>
            {salary.settings.vacationPayMode === 'separate' && (
              <button
                onClick={onToggleVacation}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  includeVacation
                    ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                }`}
              >
                {includeVacation ? 'Inkluderad i lön' : 'Inkludera i lön'}
              </button>
            )}
            {salary.settings.vacationPayMode !== 'separate' && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                Inkluderad i timlön
              </span>
            )}
          </div>
          <span className="font-medium whitespace-nowrap">
            {(salary.settings.vacationPayMode === 'separate' || includeVacation)
              ? formatCurrency(salary.vacationPay)
              : '-'}
          </span>
        </div>

        {includeVacation && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
            Semesterersättning inkluderas i bruttolönen och skattas denna månad — läggs ej till semesterpotten.
          </div>
        )}

        {salary.vacationPay > 0 && includeVacation && (
          <Row label="Total före skatt" value={formatCurrency(salary.grossPay)} bold />
        )}

        <Row
          label={salary.settings.taxMode === 'table' && salary.settings.taxTable
            ? `Skatt (tabell ${salary.settings.taxTable})`
            : `Skatt (${salary.settings.taxRate}%)`}
          value={`-${formatCurrency(salary.tax)}`}
        />

        {/* Net pay - hero */}
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4 text-center">
          <div className="text-sm text-green-700 font-medium">Nettolön</div>
          <div className="text-2xl sm:text-3xl font-bold text-green-600 mt-1">{formatCurrency(salary.netPay)}</div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  const colorClass = color === 'red' ? 'text-red-600' : 'text-blue-600';
  return (
    <div className="bg-gray-50 rounded-lg p-2 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}

function Row({ label, sublabel, value, bold, small }: { label: string; sublabel?: string; value: string; bold?: boolean; small?: boolean }) {
  return (
    <div className={`flex justify-between ${small ? 'py-0.5' : 'py-1'}`}>
      <div>
        <span className={`${bold ? 'font-semibold text-gray-800' : 'text-gray-600'} ${small ? 'text-sm' : ''}`}>{label}</span>
        {sublabel && <span className="text-xs text-gray-400 ml-2">{sublabel}</span>}
      </div>
      <span className={`${bold ? 'font-bold' : 'font-medium'} ${small ? 'text-sm' : ''}`}>{value}</span>
    </div>
  );
}
