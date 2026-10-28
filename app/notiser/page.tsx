'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import PageHeader from '@/components/ui/PageHeader';
interface Notification {
  id: number;
  kind: string;
  date: string | null;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

const kindStyle: Record<string, { label: string; className: string }> = {
  shift_changed: { label: 'Ändrat', className: 'bg-amber-100 text-amber-800' },
  shift_new: { label: 'Nytt', className: 'bg-green-100 text-green-800' },
  shift_removed: { label: 'Borttaget', className: 'bg-red-100 text-red-800' },
  app_update: { label: 'Nyhet i appen', className: 'bg-blue-100 text-blue-800' },
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Idag ${time}`;
  return `${date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} ${time}`;
}

export default function NotiserPage() {
  const [notifications, setNotifications] = useState<Notification[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/notifications');
    if (!res.ok) return;
    const data = await res.json();
    setNotifications(data.notifications);
    // Unread ones stay highlighted on this visit, but count as read from now on
    if (data.unread > 0) {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read' }),
      });
      window.dispatchEvent(new Event('notifications-read'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: number) => {
    const res = await fetch(`/api/notifications?id=${id}`, { method: 'DELETE' });
    if (res.ok) setNotifications((list) => list?.filter((n) => n.id !== id) ?? null);
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Notiser"
        subtitle="Ändringar i schemat som den automatiska synken har hittat — nya pass, flyttade tider och borttagna pass — och nyheter i appen."
      />

      {notifications === null && <p className="text-sm text-gray-400">Laddar...</p>}
      {notifications?.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-sm text-gray-500">
          Inga notiser ännu. När chefen ändrar i schemat eller appen får något nytt dyker det upp här.
        </div>
      )}

      <ul className="space-y-3">
        {notifications?.map((n) => {
          const style = kindStyle[n.kind];
          return (
            <li
              key={n.id}
              className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${n.readAt ? 'border-transparent' : 'border-blue-500'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {style && (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${style.className}`}>{style.label}</span>
                    )}
                    <span className="font-semibold text-gray-900">{n.title}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-line break-words">{n.body}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                    <span>{formatTime(n.createdAt)}</span>
                    {n.date && (
                      <Link href={`/tid?date=${n.date}`} className="text-blue-600 hover:underline">
                        Visa tider
                      </Link>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => remove(n.id)}
                  aria-label="Ta bort notis"
                  title="Ta bort"
                  className="shrink-0 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
