'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const contractOptions = [
  { value: '16ar', label: '16 år' },
  { value: '17ar', label: '17 år' },
  { value: '18ar', label: '18 år' },
  { value: '19ar', label: '19 år' },
  { value: '1ar_erf', label: '1 år erf.' },
  { value: '2ar', label: '2 år erf.' },
  { value: '3plus', label: '3+ år' },
];

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  salaryType: string;
  hourlyRate: number | null;
  monthlySalary: number | null;
  overtimeRate: number | null;
}

export default function AdminPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'user',
    salaryType: 'hourly', hourlyRate: '', monthlySalary: '', overtimeRate: '',
    workplaceType: 'none', contractLevel: '3plus', taxRate: '30',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (session && session.user.role !== 'admin') {
      router.push('/');
    }
  }, [session, router]);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    const res = await fetch('/api/users');
    if (res.ok) setUsers(await res.json());
  }

  function resetForm() {
    setForm({
      name: '', email: '', password: '', role: 'user',
      salaryType: 'hourly', hourlyRate: '', monthlySalary: '', overtimeRate: '',
      workplaceType: 'none', contractLevel: '3plus', taxRate: '30',
    });
    setEditingUser(null);
    setShowForm(false);
    setError('');
  }

  function startEdit(user: User) {
    setEditingUser(user);
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      salaryType: user.salaryType,
      hourlyRate: user.hourlyRate?.toString() || '',
      monthlySalary: user.monthlySalary?.toString() || '',
      overtimeRate: user.overtimeRate?.toString() || '',
      workplaceType: 'none',
      contractLevel: '3plus',
      taxRate: '30',
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const body: any = {
      name: form.name,
      email: form.email,
      role: form.role,
      salaryType: form.salaryType,
      hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : null,
      monthlySalary: form.monthlySalary ? parseFloat(form.monthlySalary) : null,
      overtimeRate: form.overtimeRate ? parseFloat(form.overtimeRate) : null,
    };

    if (editingUser) {
      body.id = editingUser.id;
      if (form.password) body.password = form.password;
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Fel vid uppdatering');
        return;
      }
    } else {
      body.password = form.password;
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Fel vid skapande');
        return;
      }
    }

    resetForm();
    fetchUsers();
  }

  if (session?.user?.role !== 'admin') return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Användarhantering</h1>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          {showForm ? 'Stäng' : 'Ny användare'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editingUser ? 'Redigera användare' : 'Skapa ny användare'}
          </h2>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">{error}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Namn</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-post</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Lösenord {editingUser && '(lämna tomt för att behålla)'}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editingUser}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Roll</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="user">Användare</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lönetyp</label>
              <select
                value={form.salaryType}
                onChange={(e) => setForm({ ...form, salaryType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="hourly">Timlön</option>
                <option value="monthly">Månadslön</option>
              </select>
            </div>
            {form.salaryType === 'hourly' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Timlön (SEK)</label>
                <input
                  type="number"
                  value={form.hourlyRate}
                  onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Månadslön (SEK)</label>
                  <input
                    type="number"
                    value={form.monthlySalary}
                    onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Övertidsersättning (SEK/h)</label>
                  <input
                    type="number"
                    value={form.overtimeRate}
                    onChange={(e) => setForm({ ...form, overtimeRate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Arbetsplatstyp</label>
              <select
                value={form.workplaceType}
                onChange={(e) => setForm({ ...form, workplaceType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">Ingen OB</option>
                <option value="butik">Butik</option>
                <option value="lager">Lager</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Avtalsnivå</label>
              <select
                value={form.contractLevel}
                onChange={(e) => setForm({ ...form, contractLevel: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {contractOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Skattesats (%)</label>
              <input
                type="number"
                value={form.taxRate}
                onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-4 flex space-x-2">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
              {editingUser ? 'Uppdatera' : 'Skapa'}
            </button>
            <button type="button" onClick={resetForm} className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400">
              Avbryt
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Namn</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">E-post</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Roll</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lönetyp</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lön</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Åtgärder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4 font-medium">{user.name}</td>
                <td className="px-6 py-4">{user.email}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                    {user.role === 'admin' ? 'Admin' : 'Användare'}
                  </span>
                </td>
                <td className="px-6 py-4">{user.salaryType === 'hourly' ? 'Timlön' : 'Månadslön'}</td>
                <td className="px-6 py-4">
                  {user.salaryType === 'hourly'
                    ? `${user.hourlyRate || 0} SEK/h`
                    : `${user.monthlySalary || 0} SEK/mån`}
                </td>
                <td className="px-6 py-4">
                  <button onClick={() => startEdit(user)} className="text-blue-600 hover:underline text-sm">
                    Redigera
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
