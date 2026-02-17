'use client';

import { useState, useEffect } from 'react';

interface TimeEntryDetail {
  id: number;
  projectId: number;
  projectName: string;
  date: string;
  hours: number;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number | null;
  entryType: string;
  overtimeType: string;
  description: string | null;
}

interface PayDetail {
  basePay: number;
  obAmount: number;
  obSegments: { hours: number; obPercent: number; obAmount: number }[];
  overtimePay: number;
  sickPay: number;
  grossPay: number;
  vacationPay: number;
  tax: number;
  netPay: number;
  hourlyRate: number;
}

interface Props {
  entry: TimeEntryDetail | null;
  onClose: () => void;
  onEdit: (entry: TimeEntryDetail) => void;
}

const dayNamesFull = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(amount);
}

function getDayInfo(date: string) {
  const d = new Date(date + 'T12:00:00');
  const jsDay = d.getDay();
  const dayName = dayNamesFull[jsDay];
  const isSaturday = jsDay === 6;
  const isSunday = jsDay === 0;
  return { dayName, isSaturday, isSunday };
}

export default function TimeEntryDetailsDialog({ entry, onClose, onEdit }: Props) {
  const [payDetail, setPayDetail] = useState<PayDetail | null>(null);

  useEffect(() => {
    if (!entry) return;
    fetch(`/api/calendar-data?startDate=${entry.date}&endDate=${entry.date}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.entries && data.entries.length > 0) {
          const e = data.entries.find((x: any) => x.id === entry.id);
          if (e?.pay) setPayDetail(e.pay);
        }
      })
      .catch(() => {});
  }, [entry]);

  if (!entry) return null;

  const { dayName, isSaturday, isSunday } = getDayInfo(entry.date);
  const isSick = entry.entryType === 'sick';
  const hasOB = payDetail && payDetail.obAmount > 0;
  const hasOvertime = entry.overtimeType !== 'none';

  const effectiveHours = entry.hours;
  const avgRate = payDetail && effectiveHours > 0
    ? payDetail.grossPay / effectiveHours
    : 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Hero Header */}
        <div className={`p-6 rounded-t-xl text-white ${
          isSick ? 'bg-gradient-to-r from-red-500 to-red-600' :
          isSunday ? 'bg-gradient-to-r from-pink-500 to-rose-600' :
          isSaturday ? 'bg-gradient-to-r from-purple-400 to-indigo-500' :
          'bg-gradient-to-r from-indigo-500 to-blue-600'
        }`}>
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold">{dayName}</h2>
              <p className="text-white/80 text-sm">{entry.date}</p>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none">&times;</button>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div>
              <p className="text-white/70 text-xs uppercase">Tid</p>
              <p className="text-lg font-semibold">
                {entry.startTime && entry.endTime ? `${entry.startTime}-${entry.endTime}` : '-'}
              </p>
            </div>
            <div>
              <p className="text-white/70 text-xs uppercase">Timmar</p>
              <p className="text-lg font-semibold">{entry.hours.toFixed(2)}h</p>
            </div>
            <div>
              <p className="text-white/70 text-xs uppercase">Total</p>
              <p className="text-lg font-semibold">{payDetail ? formatCurrency(payDetail.grossPay) : '...'}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Status Chips */}
          <div className="flex flex-wrap gap-2">
            {isSick && <Chip color="red">Sjukdag</Chip>}
            {isSunday && <Chip color="pink">Söndag</Chip>}
            {isSaturday && <Chip color="purple">Lördag</Chip>}
            {hasOB && <Chip color="orange">OB-tillägg</Chip>}
            {hasOvertime && <Chip color="amber">
              {entry.overtimeType === 'mertid' ? 'Mertid' : entry.overtimeType === 'enkel' ? 'Enkel ÖT' : 'Kval. ÖT'}
            </Chip>}
            <Chip color="blue">{entry.projectName}</Chip>
          </div>

          {/* Work time card */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Arbetstid</h3>
            {entry.startTime && entry.endTime && (
              <div className="mb-3">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: `${Math.min(100, (entry.hours / 10) * 100)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>{entry.startTime}</span>
                  <span>{entry.endTime}</span>
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Rast</span>
                <p className="font-medium">{entry.breakMinutes ?? 0} min</p>
              </div>
              <div>
                <span className="text-gray-500">Effektiv tid</span>
                <p className="font-medium">{entry.hours.toFixed(2)}h</p>
              </div>
              <div>
                <span className="text-gray-500">Snittlön</span>
                <p className="font-medium">{avgRate > 0 ? formatCurrency(avgRate) + '/h' : '-'}</p>
              </div>
            </div>
          </div>

          {/* Pay specification */}
          {payDetail && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Lönespecifikation</h3>
              <div className="space-y-1 text-sm">
                <PayRow label="Grundlön" value={formatCurrency(payDetail.basePay)} />
                {payDetail.obSegments.map((seg, i) => (
                  seg.obAmount > 0 && (
                    <PayRow key={i} label={`OB ${seg.obPercent}% (${seg.hours.toFixed(1)}h)`} value={formatCurrency(seg.obAmount)} highlight />
                  )
                ))}
                {payDetail.overtimePay > 0 && (
                  <PayRow label="Övertidstillägg" value={formatCurrency(payDetail.overtimePay)} />
                )}
                {payDetail.sickPay > 0 && (
                  <PayRow label="Sjuklön" value={formatCurrency(payDetail.sickPay)} />
                )}
                <div className="border-t pt-1 mt-1">
                  <PayRow label="Brutto" value={formatCurrency(payDetail.grossPay)} bold />
                </div>
                {payDetail.vacationPay > 0 && (
                  <PayRow label="Semesterersättning" value={formatCurrency(payDetail.vacationPay)} />
                )}
                <PayRow label="Skatt" value={`-${formatCurrency(payDetail.tax)}`} />
                <div className="border-t pt-1 mt-1">
                  <div className="flex justify-between">
                    <span className="font-bold text-gray-800">Netto</span>
                    <span className="font-bold text-green-600">{formatCurrency(payDetail.netPay)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {entry.description && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Anteckning</h3>
              <p className="text-sm text-gray-600">{entry.description}</p>
            </div>
          )}

          {/* Edit button */}
          <button
            onClick={() => onEdit(entry)}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Redigera
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color: string }) {
  const colorClasses: Record<string, string> = {
    red: 'bg-red-100 text-red-700',
    pink: 'bg-pink-100 text-pink-700',
    purple: 'bg-purple-100 text-purple-700',
    orange: 'bg-orange-100 text-orange-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
  };
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${colorClasses[color] || 'bg-gray-100 text-gray-700'}`}>
      {children}
    </span>
  );
}

function PayRow({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className={`text-gray-600 ${bold ? 'font-semibold text-gray-800' : ''}`}>{label}</span>
      <span className={`${bold ? 'font-bold' : 'font-medium'} ${highlight ? 'text-orange-600' : ''}`}>{value}</span>
    </div>
  );
}
