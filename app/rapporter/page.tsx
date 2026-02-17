'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

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

interface UserOption {
  id: number;
  name: string;
}

const overtimeLabels: Record<string, string> = {
  none: '-',
  mertid: 'Mertid',
  enkel: 'Enkel ÖT',
  kvalificerad: 'Kval ÖT',
};

export default function RapporterPage() {
  const { data: session } = useSession();
  const [entries, setEntries] = useState<ReportEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [projectId, setProjectId] = useState('');
  const [userId, setUserId] = useState('');

  const isAdmin = session?.user?.role === 'admin';

  useEffect(() => {
    fetch('/api/projects').then((r) => r.json()).then(setProjects);
    if (isAdmin) {
      fetch('/api/users').then((r) => r.json()).then(setUsers);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate, projectId, userId]);

  async function fetchReport() {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (projectId) params.set('projectId', projectId);
    if (userId) params.set('userId', userId);

    const res = await fetch(`/api/reports?${params}`);
    if (res.ok) setEntries(await res.json());
  }

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  function exportCSV() {
    const header = 'Datum,Användare,Projekt,Start,Slut,Rast(min),Timmar,Typ,Övertid,Beskrivning\n';
    const rows = entries.map((e) =>
      `${e.date},"${e.userName}","${e.projectName}",${e.startTime || ''},${e.endTime || ''},${e.breakMinutes || 0},${e.hours},${e.entryType},${overtimeLabels[e.overtimeType] || '-'},"${e.description || ''}"`
    ).join('\n');

    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
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
        doc.text(e.entryType === 'sick' ? 'Sjuk' : 'Arb', 148, y);
        doc.text((e.description || '').substring(0, 25), 165, y);
      });

      doc.save(`rapport_${startDate}_${endDate}.pdf`);
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Rapporter</h1>

      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Från</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Till</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Projekt</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Alla</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Användare</label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Alla</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={exportCSV} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700">
              Exportera CSV
            </button>
            <button onClick={exportPDF} className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700">
              Exportera PDF
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-3 bg-gray-50 flex justify-between items-center">
          <span className="text-sm text-gray-600">{entries.length} poster</span>
          <span className="font-semibold">Totalt: {totalHours.toFixed(1)} timmar</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Användare</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Projekt</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Slut</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rast</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timmar</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Typ</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ÖT</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Beskrivning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3">{entry.date}</td>
                  <td className="px-4 py-3">{entry.userName}</td>
                  <td className="px-4 py-3">{entry.projectName}</td>
                  <td className="px-4 py-3 text-sm">{entry.startTime || '-'}</td>
                  <td className="px-4 py-3 text-sm">{entry.endTime || '-'}</td>
                  <td className="px-4 py-3 text-sm">{entry.breakMinutes ? `${entry.breakMinutes}m` : '-'}</td>
                  <td className="px-4 py-3">{entry.hours.toFixed(1)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      entry.entryType === 'sick' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {entry.entryType === 'sick' ? 'Sjuk' : 'Arb'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{overtimeLabels[entry.overtimeType] || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{entry.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {entries.length === 0 && (
          <p className="text-center text-gray-500 py-8">Inga poster hittades.</p>
        )}
      </div>
    </div>
  );
}
