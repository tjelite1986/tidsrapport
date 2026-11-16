'use client';

import { useEffect, useState } from 'react';

import PageHeader from '@/components/ui/PageHeader';
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
    // On a phone the list sits below the form; bring the form back into view.
    document.getElementById('project-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('project-name')?.focus({ preventScroll: true });
  }

  return (
    <div>
      <PageHeader title="Projekt" />

      <form id="project-form" onSubmit={handleSubmit} className="surface p-4 sm:p-6 mb-6 scroll-mt-4">
        <h2 className="text-lg font-semibold mb-4">
          {editingId ? 'Redigera projekt' : 'Skapa nytt projekt'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="project-name" className="field-label">Projektnamn</label>
            <input
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="field"
            />
          </div>
          <div>
            <label htmlFor="project-description" className="field-label">Beskrivning</label>
            <input
              id="project-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="field"
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex">
          <button type="submit" className="btn btn-primary btn-3d px-6">
            {editingId ? 'Uppdatera' : 'Skapa'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setName(''); setDescription(''); }}
              className="btn btn-secondary"
            >
              Avbryt
            </button>
          )}
        </div>
      </form>

      {deleteError && (
        <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{deleteError}</div>
      )}

      <div className="bg-white rounded-xl card-3d border border-gray-100 overflow-hidden">
        <ul className="md:hidden divide-y divide-gray-200">
          {projects.map((project) => (
            <li key={project.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium break-words">{project.name}</p>
                  <p className="text-sm text-gray-600 break-words">{project.description || '-'}</p>
                </div>
                <span className={`shrink-0 px-2 py-1 rounded-full text-xs ${project.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {project.active ? 'Aktiv' : 'Inaktiv'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button onClick={() => startEdit(project)} className="btn btn-accent">
                  Redigera
                </button>
                <button onClick={() => toggleActive(project)} className="btn btn-secondary">
                  {project.active ? 'Inaktivera' : 'Aktivera'}
                </button>
                <button onClick={() => handleDelete(project)} className="btn btn-danger">
                  Ta bort
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden md:block overflow-x-auto">
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
