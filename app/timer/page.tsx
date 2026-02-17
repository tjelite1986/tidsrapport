'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

interface Project {
  id: number;
  name: string;
  active: boolean;
}

interface RecentEntry {
  id: number;
  date: string;
  hours: number;
  projectName: string;
  startTime: string | null;
  endTime: string | null;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function autoBreakMinutes(totalMinutes: number): number {
  const hours = totalMinutes / 60;
  if (hours >= 8) return 60;
  if (hours >= 6) return 30;
  if (hours >= 4) return 15;
  return 0;
}

function getTimerColor(hours: number): { bg: string; text: string; gradient: string } {
  if (hours > 8) return { bg: 'bg-yellow-50', text: 'text-yellow-600', gradient: 'from-yellow-400 to-orange-500' };
  if (hours >= 4) return { bg: 'bg-blue-50', text: 'text-blue-600', gradient: 'from-blue-400 to-indigo-500' };
  return { bg: 'bg-green-50', text: 'text-green-600', gradient: 'from-green-400 to-emerald-500' };
}

const STORAGE_KEY = 'tidsrapport-timer';

interface TimerState {
  running: boolean;
  paused: boolean;
  startedAt: number | null;
  elapsed: number;
  pauseElapsed: number; // total pause time in seconds
  pauseStartedAt: number | null;
  projectId: string;
}

export default function TimerPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [timer, setTimer] = useState<TimerState>({
    running: false,
    paused: false,
    startedAt: null,
    elapsed: 0,
    pauseElapsed: 0,
    pauseStartedAt: null,
    projectId: '',
  });
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [description, setDescription] = useState('');
  const [saved, setSaved] = useState(false);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/projects').then((r) => r.json()).then(setProjects);
    fetchRecent();

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const state: TimerState = JSON.parse(stored);
        setTimer(state);
      } catch {}
    }
  }, []);

  async function fetchRecent() {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    const res = await fetch(`/api/time-entries?startDate=${start.toISOString().split('T')[0]}&endDate=${now.toISOString().split('T')[0]}`);
    if (res.ok) {
      const entries = await res.json();
      setRecentEntries(entries.slice(-5).reverse());
    }
  }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timer));
  }, [timer]);

  useEffect(() => {
    if (timer.running && !timer.paused && timer.startedAt) {
      const update = () => {
        const now = Math.floor(Date.now() / 1000);
        setDisplaySeconds(timer.elapsed + (now - Math.floor(timer.startedAt! / 1000)));
      };
      update();
      intervalRef.current = setInterval(update, 1000);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    } else if (timer.paused) {
      setDisplaySeconds(timer.elapsed);
    } else {
      setDisplaySeconds(timer.elapsed);
    }
  }, [timer.running, timer.paused, timer.startedAt, timer.elapsed]);

  function startTimer() {
    setTimer({
      ...timer,
      running: true,
      paused: false,
      startedAt: Date.now(),
    });
  }

  function pauseTimer() {
    const now = Math.floor(Date.now() / 1000);
    const additionalSeconds = timer.startedAt ? now - Math.floor(timer.startedAt / 1000) : 0;
    setTimer({
      ...timer,
      paused: true,
      pauseStartedAt: Date.now(),
      elapsed: timer.elapsed + additionalSeconds,
      startedAt: null,
    });
  }

  function resumeTimer() {
    const pauseDuration = timer.pauseStartedAt
      ? Math.floor((Date.now() - timer.pauseStartedAt) / 1000)
      : 0;
    setTimer({
      ...timer,
      paused: false,
      running: true,
      startedAt: Date.now(),
      pauseElapsed: timer.pauseElapsed + pauseDuration,
      pauseStartedAt: null,
    });
  }

  function stopTimer() {
    const now = Math.floor(Date.now() / 1000);
    const additionalSeconds = timer.startedAt ? now - Math.floor(timer.startedAt / 1000) : 0;
    setTimer({
      ...timer,
      running: false,
      paused: false,
      startedAt: null,
      elapsed: timer.elapsed + additionalSeconds,
    });
  }

  function resetTimer() {
    setTimer({
      running: false,
      paused: false,
      startedAt: null,
      elapsed: 0,
      pauseElapsed: 0,
      pauseStartedAt: null,
      projectId: timer.projectId,
    });
    setDisplaySeconds(0);
  }

  async function saveAsEntry() {
    if (!timer.projectId || displaySeconds < 60) return;

    const totalMinutes = Math.round(displaySeconds / 60);
    const now = new Date();
    const endTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const startDate = new Date(now.getTime() - displaySeconds * 1000);
    const startTime = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
    const date = now.toISOString().split('T')[0];
    const breakMin = autoBreakMinutes(totalMinutes);

    const res = await fetch('/api/time-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: parseInt(timer.projectId),
        date,
        startTime,
        endTime,
        breakMinutes: breakMin,
        description,
      }),
    });

    if (res.ok) {
      setSaved(true);
      resetTimer();
      setDescription('');
      fetchRecent();
      setTimeout(() => setSaved(false), 3000);
    }
  }

  const totalMinutes = Math.round(displaySeconds / 60);
  const breakMin = autoBreakMinutes(totalMinutes);
  const workHours = Math.max(0, (totalMinutes - breakMin) / 60);
  const hours = displaySeconds / 3600;
  const colors = getTimerColor(hours);
  const pauseMinutes = Math.round(timer.pauseElapsed / 60);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Live Timer</h1>

      {saved && (
        <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm font-medium">
          Tidsregistrering sparad!
        </div>
      )}

      {/* Timer display */}
      <div className={`${colors.bg} p-8 rounded-2xl shadow-lg text-center mb-6 transition-colors duration-1000`}>
        <div className={`inline-block bg-gradient-to-r ${colors.gradient} text-white rounded-2xl px-8 py-4 mb-6`}>
          <div className="text-5xl sm:text-6xl md:text-7xl font-mono font-bold tracking-wider">
            {formatElapsed(displaySeconds)}
          </div>
        </div>

        <div className="mb-6">
          <select
            value={timer.projectId}
            onChange={(e) => setTimer({ ...timer, projectId: e.target.value })}
            className="px-4 py-2.5 border border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Välj projekt</option>
            {projects.filter((p) => p.active).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-center gap-3 flex-wrap">
          {!timer.running && !timer.paused && (
            <button
              onClick={startTimer}
              disabled={!timer.projectId}
              className="bg-green-600 text-white px-8 py-3 rounded-xl text-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
            >
              Starta
            </button>
          )}
          {timer.running && !timer.paused && (
            <>
              <button
                onClick={pauseTimer}
                className="bg-yellow-500 text-white px-8 py-3 rounded-xl text-lg font-semibold hover:bg-yellow-600 transition shadow-md"
              >
                Paus
              </button>
              <button
                onClick={stopTimer}
                className="bg-red-600 text-white px-8 py-3 rounded-xl text-lg font-semibold hover:bg-red-700 transition shadow-md"
              >
                Stoppa
              </button>
            </>
          )}
          {timer.paused && (
            <>
              <button
                onClick={resumeTimer}
                className="bg-green-600 text-white px-8 py-3 rounded-xl text-lg font-semibold hover:bg-green-700 transition shadow-md"
              >
                Återuppta
              </button>
              <button
                onClick={stopTimer}
                className="bg-red-600 text-white px-8 py-3 rounded-xl text-lg font-semibold hover:bg-red-700 transition shadow-md"
              >
                Stoppa
              </button>
            </>
          )}
          {(displaySeconds > 0 && !timer.running && !timer.paused) && (
            <button
              onClick={resetTimer}
              className="bg-gray-400 text-white px-8 py-3 rounded-xl text-lg font-semibold hover:bg-gray-500 transition shadow-md"
            >
              Återställ
            </button>
          )}
        </div>

        {displaySeconds >= 60 && (
          <div className="mt-6 flex justify-center gap-6 text-sm text-gray-600 flex-wrap">
            <div>Total: <strong>{(totalMinutes / 60).toFixed(1)}h</strong></div>
            <div>Rast: <strong>{breakMin}m</strong></div>
            <div>Arbetstid: <strong>{workHours.toFixed(1)}h</strong></div>
            {pauseMinutes > 0 && <div>Pausad: <strong>{pauseMinutes}m</strong></div>}
          </div>
        )}

        {timer.paused && (
          <div className="mt-3 text-yellow-600 font-medium text-sm animate-pulse">
            Pausad
          </div>
        )}
      </div>

      {/* Save section */}
      {!timer.running && !timer.paused && displaySeconds >= 60 && (
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold mb-4">Spara som tidsregistrering</h2>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivning</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Vad jobbade du med?"
              />
            </div>
            <button
              onClick={saveAsEntry}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
            >
              Spara
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Quick actions */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Snabbåtgärder</h2>
          <div className="space-y-2">
            <Link href="/tid" className="block w-full text-left px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition font-medium text-sm">
              Lägg till manuellt
            </Link>
            <Link href="/tid" className="block w-full text-left px-4 py-3 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition font-medium text-sm">
              Visa historik
            </Link>
            <Link href="/lon" className="block w-full text-left px-4 py-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition font-medium text-sm">
              Se löneberäkning
            </Link>
          </div>
        </div>

        {/* Recent entries */}
        {recentEntries.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Senaste registreringar</h2>
            <div className="space-y-2">
              {recentEntries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div>
                    <div className="text-sm font-medium">{entry.projectName}</div>
                    <div className="text-xs text-gray-500">
                      {entry.date} {entry.startTime && entry.endTime ? `${entry.startTime}-${entry.endTime}` : ''}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-blue-600">{entry.hours.toFixed(1)}h</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">Tips</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>Timern sparas automatiskt - du kan stänga webbläsaren och komma tillbaka.</li>
          <li>Rast beräknas automatiskt: 15 min vid 4h+, 30 min vid 6h+, 60 min vid 8h+.</li>
          <li>Använd paus-knappen för att spåra raster under dagen.</li>
          <li>Färgen ändras baserat på tid: grön (&lt;4h), blå (4-8h), gul (&gt;8h).</li>
        </ul>
      </div>
    </div>
  );
}
