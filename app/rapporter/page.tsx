'use client';

import { useEffect, useState } from 'react';

import PageHeader from '@/components/ui/PageHeader';
import { buildReportCsv, entryTypeLabel, OVERTIME_LABELS } from '@/lib/reports/csv';

interface ReportEntry {
  id: number;
  userName: string;
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

interface Project {
  id: number;
  name: string;
}

export default function RapporterPage() {
  const [entries, setEntries] = useState<ReportEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [projectId, setProjectId] = useState('');

  useEffect(() => {
    fetch('/api/projects').then((r) => r.json()).then(setProjects);
  }, []);

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate, projectId]);

  async function fetchReport() {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (projectId) params.set('projectId', projectId);

    const res = await fetch(`/api/reports?${params}`);
    if (res.ok) setEntries(await res.json());
  }

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  function exportCSV() {
    const csv = buildReportCsv(entries);

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Tidsrapport', 14, 20);
      doc.setFontSize(10);
      doc.text(`Period: ${startDate} - ${endDate}`, 14, 30);
      doc.text(`Totalt: ${totalHours.toFixed(1)} timmar`, 14, 36);

      let y = 48;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Datum', 14, y);
      doc.text('Användare', 35, y);
      doc.text('Projekt', 65, y);
      doc.text('Start', 100, y);
      doc.text('Slut', 115, y);
      doc.text('Timmar', 130, y);
      doc.text('Typ', 148, y);
      doc.text('Beskrivning', 165, y);
      doc.setFont('helvetica', 'normal');

      entries.forEach((e) => {
        y += 6;
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
        doc.text(e.date, 14, y);
        doc.text((e.userName || '').substring(0, 15), 35, y);
        doc.text((e.projectName || '').substring(0, 18), 65, y);
        doc.text(e.startTime || '-', 100, y);
        doc.text(e.endTime || '-', 115, y);
        doc.text(e.hours.toFixed(1), 130, y);
        doc.text(entryTypeLabel(e.entryType), 148, y);
        doc.text((e.description || '').substring(0, 25), 165, y);
      });

      doc.save(`rapport_${startDate}_${endDate}.pdf`);
    });
  }

  const typeBadge = (entryType: string) =>
    entryType === 'sick' ? 'bg-red-100 text-red-700' : entryType === 'vab' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';

  return (
    <div>
      <PageHeader title="Rapporter" />

      <section aria-label="Filter och export" className="surface p-4 sm:p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-[auto_auto_minmax(10rem,1fr)_auto] gap-3 md:gap-4 md:items-end">
          <div className="min-w-0">
            <label htmlFor="report-from" className="field-label">Från</label>
            <input id="report-from" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="field" />
          </div>
          <div className="min-w-0">
            <label htmlFor="report-to" className="field-label">Till</label>
            <input id="report-to" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="field" />
          </div>
          <div className="col-span-2 md:col-span-1 min-w-0">
            <label htmlFor="report-project" className="field-label">Projekt</label>
            <select id="report-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="field">
              <option value="">Alla</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2 md:col-span-1 grid grid-cols-2 gap-2">
            <button onClick={exportCSV} className="btn bg-green-600 text-white hover:bg-green-700">
              Exportera CSV
            </button>
            <button onClick={exportPDF} className="btn bg-red-600 text-white hover:bg-red-700">
              Exportera PDF
            </button>
          </div>
        </div>
      </section>

      <section aria-label="Poster" className="surface overflow-hidden">
        <div className="px-4 sm:px-6 py-3 bg-gray-50 flex flex-wrap justify-between items-center gap-2">
          <span className="text-sm text-gray-600">{entries.length} poster</span>
          <span className="font-semibold tabular-nums">Totalt: {totalHours.toFixed(1)} timmar</span>
        </div>

        {/* Phones: one card per entry */}
        <ul className="md:hidden divide-y divide-gray-200">
          {entries.map((entry) => (
            <li key={entry.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium tabular-nums">{entry.date}</p>
                  <p className="text-sm text-gray-600 break-words">{entry.projectName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold tabular-nums">{entry.hours.toFixed(1)} h</p>
                  <span className={`inline-block mt-0.5 text-xs px-1.5 py-0.5 rounded ${typeBadge(entry.entryType)}`}>
                    {entryTypeLabel(entry.entryType)}
                  </span>
                </div>
              </div>
              <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                <div className="flex gap-1"><dt>Tid</dt><dd className="text-gray-700 tabular-nums">{entry.startTime || '-'}–{entry.endTime || '-'}</dd></div>
                <div className="flex gap-1"><dt>Rast</dt><dd className="text-gray-700">{entry.breakMinutes ? `${entry.breakMinutes}m` : '-'}</dd></div>
                {entry.overtimeType !== 'none' && (
                  <div className="flex gap-1"><dt>ÖT</dt><dd className="text-gray-700">{OVERTIME_LABELS[entry.overtimeType] || '-'}</dd></div>
                )}
                <div className="flex gap-1"><dt>Användare</dt><dd className="text-gray-700">{entry.userName}</dd></div>
              </dl>
              {entry.description && <p className="mt-1 text-sm text-gray-600 break-words">{entry.description}</p>}
            </li>
          ))}
        </ul>

        {/* Tablet and up: the full table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Användare</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Projekt</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Slut</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rast</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timmar</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Typ</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ÖT</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Beskrivning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 whitespace-nowrap">{entry.date}</td>
                  <td className="px-4 py-3">{entry.userName}</td>
                  <td className="px-4 py-3">{entry.projectName}</td>
                  <td className="px-4 py-3 text-sm">{entry.startTime || '-'}</td>
                  <td className="px-4 py-3 text-sm">{entry.endTime || '-'}</td>
                  <td className="px-4 py-3 text-sm">{entry.breakMinutes ? `${entry.breakMinutes}m` : '-'}</td>
                  <td className="px-4 py-3">{entry.hours.toFixed(1)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${typeBadge(entry.entryType)}`}>
                      {entryTypeLabel(entry.entryType)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{OVERTIME_LABELS[entry.overtimeType] || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{entry.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {entries.length === 0 && (
          <p className="text-center text-gray-500 py-8">Inga poster hittades.</p>
        )}
      </section>
    </div>
  );
}
