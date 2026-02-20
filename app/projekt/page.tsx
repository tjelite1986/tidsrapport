'use client';

import { useEffect, useState } from 'react';

interface Project {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
}

export default function ProjektPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    const res = await fetch('/api/projects');
    setProjects(await res.json());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId) {
      await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, name, description }),
      });
      setEditingId(null);
    } else {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
    }
    setName('');
    setDescription('');
    fetchProjects();
  }

  async function toggleActive(project: Project) {
    await fetch('/api/projects', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: project.id, active: !project.active }),
    });
    fetchProjects();
  }

  async function handleDelete(project: Project) {
    if (!confirm(`Ta bort projektet "${project.name}"?`)) return;
    setDeleteError('');
    const res = await fetch(`/api/projects?id=${project.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      setDeleteError(data.error || 'Kunde inte ta bort projektet');
      return;
    }
    fetchProjects();
  }

  function startEdit(project: Project) {
    setEditingId(project.id);
    setName(project.name);
    setDescription(project.description || '');
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Projekt</h1>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">
          {editingId ? 'Redigera projekt' : 'Skapa nytt projekt'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Projektnamn</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivning</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="mt-4 flex space-x-2">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
            {editingId ? 'Uppdatera' : 'Skapa'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setName(''); setDescription(''); }}
              className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
            >
              Avbryt
            </button>
          )}
        </div>
      </form>

      {deleteError && (
        <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{deleteError}</div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Namn</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Beskrivning</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Åtgärder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {projects.map((project) => (
              <tr key={project.id}>
                <td className="px-6 py-4 font-medium">{project.name}</td>
                <td className="px-6 py-4 text-gray-600">{project.description || '-'}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs ${project.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {project.active ? 'Aktiv' : 'Inaktiv'}
                  </span>
                </td>
                <td className="px-6 py-4 space-x-2">
                  <button onClick={() => startEdit(project)} className="text-blue-600 hover:underline text-sm">
                    Redigera
                  </button>
                  <button onClick={() => toggleActive(project)} className="text-gray-600 hover:underline text-sm">
                    {project.active ? 'Inaktivera' : 'Aktivera'}
                  </button>
                  <button onClick={() => handleDelete(project)} className="text-red-600 hover:underline text-sm">
                    Ta bort
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {projects.length === 0 && (
          <p className="text-center text-gray-500 py-8">Inga projekt ännu.</p>
        )}
      </div>
    </div>
  );
}
