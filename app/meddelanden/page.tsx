'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

import PageHeader from '@/components/ui/PageHeader';
interface Contact {
  id: number;
  name: string;
  unread: number;
  lastMessage: string | null;
  lastAt: string | null;
}

interface Message {
  id: number;
  senderId: number;
  recipientId: number;
  body: string;
  createdAt: string;
  readAt: string | null;
}

const MAX_LENGTH = 2000;

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  return `${date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} ${time}`;
}

export default function MeddelandenPage() {
  const { data: session } = useSession();
  const me = session ? parseInt(session.user.id) : null;

  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastMessageId = useRef<number | null>(null);
  const selectedRef = useRef<number | null>(null);
  selectedRef.current = selectedId;

  const loadContacts = useCallback(async () => {
    const res = await fetch('/api/messages');
    if (res.ok) setContacts((await res.json()).contacts);
  }, []);

  const loadConversation = useCallback(async (otherId: number) => {
    const res = await fetch(`/api/messages?with=${otherId}`);
    if (!res.ok) return;
    const data = await res.json();
    // A poll for the previous conversation can land after the user switched.
    if (selectedRef.current !== otherId) return;
    setMessages(data.messages);
    window.dispatchEvent(new Event('messages-read'));
  }, []);

  useEffect(() => {
    loadContacts();
    const timer = setInterval(loadContacts, 30_000);
    return () => clearInterval(timer);
  }, [loadContacts]);

  useEffect(() => {
    if (selectedId === null) return;
    setMessages([]);
    lastMessageId.current = null;
    loadConversation(selectedId).then(loadContacts);
    const timer = setInterval(() => loadConversation(selectedId), 10_000);
    return () => clearInterval(timer);
  }, [selectedId, loadConversation, loadContacts]);

  // Scroll to the bottom only when a new message arrives, not on every poll.
  useEffect(() => {
    const newest = messages.length ? messages[messages.length - 1].id : null;
    if (newest !== lastMessageId.current) {
      lastMessageId.current = newest;
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages]);

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || selectedId === null || sending) return;
    setSending(true);
    setError('');
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId: selectedId, body }),
    });
    setSending(false);
    if (!res.ok) {
      setError('Meddelandet kunde inte skickas. Försök igen.');
      return;
    }
    const sent: Message = await res.json();
    if (selectedRef.current === sent.recipientId) setMessages((prev) => [...prev, sent]);
    setDraft('');
    loadContacts();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const selected = contacts?.find((c) => c.id === selectedId) ?? null;

  return (
    <div>
      <PageHeader title="Meddelanden" />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden md:grid md:grid-cols-[18rem_1fr] md:h-[70vh]">
        {/* Contact list — the whole view on a phone until someone is picked */}
        <div
          className={`border-r border-gray-100 overflow-y-auto ${selected ? 'hidden md:block' : 'block'}`}
        >
          {contacts === null && <p className="p-4 text-sm text-gray-400">Laddar...</p>}
          {contacts?.length === 0 && (
            <p className="p-4 text-sm text-gray-500">Det finns inga andra användare att skriva till.</p>
          )}
          {contacts?.map((contact) => (
            <button
              key={contact.id}
              onClick={() => setSelectedId(contact.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 flex items-start gap-3 transition-colors ${
                contact.id === selectedId ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="w-9 h-9 shrink-0 bg-slate-700 rounded-full flex items-center justify-center text-sm font-bold text-white">
                {contact.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate ${contact.unread ? 'font-bold' : 'font-medium'}`}>{contact.name}</span>
                  {contact.lastAt && (
                    <span className="text-xs text-gray-400 shrink-0">{formatTime(contact.lastAt)}</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-500 truncate">
                    {contact.lastMessage ?? 'Inga meddelanden än'}
                  </span>
                  {contact.unread > 0 && (
                    <span className="shrink-0 min-w-[1.25rem] px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none text-center">
                      {contact.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Conversation */}
        <div className={`flex-col h-[75vh] md:h-auto min-h-0 ${selected ? 'flex' : 'hidden md:flex'}`}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400 p-4">
              Välj en person i listan för att skriva.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                <button
                  onClick={() => setSelectedId(null)}
                  className="md:hidden text-blue-600 text-sm font-medium"
                  aria-label="Tillbaka"
                >
                  &larr;
                </button>
                <span className="font-semibold">{selected.name}</span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
                {messages.length === 0 && (
                  <p className="text-center text-sm text-gray-400">Inga meddelanden än. Skriv det första!</p>
                )}
                {messages.map((message) => {
                  const mine = message.senderId === me;
                  return (
                    <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          mine ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-gray-800 rounded-bl-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        <p className={`text-[10px] mt-1 text-right ${mine ? 'text-blue-100' : 'text-gray-400'}`}>
                          {formatTime(message.createdAt)}
                          {mine && message.readAt && ' · Läst'}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={handleSend} className="border-t border-gray-100 p-3">
                {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    maxLength={MAX_LENGTH}
                    rows={2}
                    placeholder={`Skriv till ${selected.name}...`}
                    className="flex-1 min-w-0 resize-none border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || sending}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
                  >
                    Skicka
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
