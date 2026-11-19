'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Sparkles, Send, Square, Plus, Copy, RotateCcw, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from './ui/button';
import { safeUrl, type Citation } from '@/lib/schemas';
type ChatMessage = { role: 'user' | 'assistant'; content: string; sources?: Citation[] };
type Conversation = { id: string; title: string; messages: ChatMessage[] };
const STORE = 'octagon-conversations-v1';
// Hide internal ingestion endpoints in chat output and legacy local history.
// The source publisher is sufficient for readers; API URLs are not public article links.
function publicAnswer(text: string) {
  return text
    .replace(/\[[^\]]*\]\(https?:\/\/api\.ufcalendar\.com[^)\s]*\)/gi, 'UFCalendar')
    .replace(/https?:\/\/api\.ufcalendar\.com\/[^\s)\]】]*/gi, 'UFCalendar');
}
const subscribe = (callback: () => void) => {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
};
const clientReady = () => true,
  serverReady = () => false;
function readHistory(): Conversation[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORE) || '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (c) =>
          c &&
          typeof c.id === 'string' &&
          typeof c.title === 'string' &&
          Array.isArray(c.messages) &&
          c.messages.every(
            (m: ChatMessage) =>
              m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string',
          ),
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}
export function Chat() {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  return ready ? <ChatClient /> : <div className="loading">Loading your conversation…</div>;
}
function ChatClient() {
  const [conversations, setConversations] = useState<Conversation[]>(readHistory),
    [id, setId] = useState(() => crypto.randomUUID()),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [input, setInput] = useState(
      () => new URLSearchParams(window.location.search).get('q')?.slice(0, 2500) || '',
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(-1);
  const abort = useRef<AbortController | null>(null),
    bottom = useRef<HTMLDivElement>(null);
  const fa = /[\u0600-\u06ff]/.test(input || messages.at(-1)?.content || '');
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [messages, busy]);
  useEffect(() => {
    if (!messages.length) return;
    const c = {
      id,
      title: messages.find((m) => m.role === 'user')?.content.slice(0, 65) || 'Conversation',
      messages,
    };
    try {
      localStorage.setItem(
        STORE,
        JSON.stringify([c, ...readHistory().filter((p) => p.id !== id)].slice(0, 20)),
      );
    } catch {}
  }, [messages, id]);
  async function send(text: string, base = messages) {
    if (!text.trim() || busy) return;
    const next: ChatMessage[] = [...base, { role: 'user', content: text.trim() }];
    setInput('');
    setError('');
    setBusy(true);
    setMessages([...next, { role: 'assistant', content: '' }]);
    const controller = new AbortController();
    abort.current = controller;
    let answer = '',
      sources: Citation[] = [];
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(-15) }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Request failed');
      }
      if (!response.body) throw new Error('No response stream');
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const part = JSON.parse(line);
          if (part.type === 'error') throw new Error(part.error);
          if (part.type === 'text') answer += part.text;
          if (part.type === 'sources') sources = part.sources;
          setMessages([...next, { role: 'assistant', content: answer, sources }]);
        }
        if (done) break;
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Unable to connect');
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }
  function newChat() {
    abort.current?.abort();
    setConversations(readHistory());
    setId(crypto.randomUUID());
    setMessages([]);
    setError('');
    setInput('');
  }
  function retry() {
    const last = messages.findLastIndex((m) => m.role === 'user');
    if (last >= 0) void send(messages[last].content, messages.slice(0, last));
  }
  return (
    <div className="chat-layout">
      <aside className="chat-sidebar">
        <Button variant="secondary" onClick={newChat} disabled={busy}>
          <Plus size={16} />
          New conversation
        </Button>
        <span className="eyebrow">YOUR CONVERSATIONS</span>
        {conversations.map((c) => (
          <button
            className="history-item"
            disabled={busy}
            onClick={() => {
              setId(c.id);
              setMessages(c.messages);
              setError('');
            }}
            key={c.id}
          >
            {c.title}
          </button>
        ))}
        <button
          className="history-item"
          onClick={() => {
            localStorage.removeItem(STORE);
            setConversations([]);
            newChat();
          }}
          disabled={busy}
        >
          Clear local history
        </button>
        <small>
          History stays in this browser. Your questions are sent to configured AI providers when
          synthesis is needed.
        </small>
      </aside>
      <section className="chat-main">
        <div className="chat-toolbar">
          <strong>Octagon intelligence</strong>
          <div className="nav-actions">
            <span className="tag">ENGLISH</span>
            <button
              className="icon-button"
              onClick={newChat}
              disabled={busy}
              aria-label="New conversation"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
        <details className="mobile-chat-history">
          <summary>Local conversations</summary>
          {conversations.map((c) => (
            <button
              className="history-item"
              key={c.id}
              disabled={busy}
              onClick={() => {
                setId(c.id);
                setMessages(c.messages);
                setError('');
              }}
            >
              {c.title}
            </button>
          ))}
          <button
            className="history-item"
            disabled={busy}
            onClick={() => {
              localStorage.removeItem(STORE);
              newChat();
            }}
          >
            Clear local history
          </button>
        </details>
        <div className="chat-messages" aria-live="polite" aria-busy={busy}>
          {!messages.length && (
            <div className="chat-welcome">
              <div className="chat-emblem">
                <Sparkles size={27} />
              </div>
              <div className="section-kicker">EVERY QUESTION HAS A CORNER.</div>
              <h1>What’s on your fight mind?</h1>
              <p>
                Follow the records. Explore the details.
                <br />
                Ask anything about the UFC.
              </p>
              <div className="suggestions">
                {[
                  'What is the next UFC event?',
                  'Explain UFC fight statistics',
                  'Show the latest UFC rankings',
                  'What happened at the last UFC event?',
                ].map((q) => (
                  <button key={q} onClick={() => void send(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <article
              key={i}
              className={`message message-${m.role}`}
              dir={/[\u0600-\u06ff]/.test(m.content) ? 'rtl' : 'ltr'}
            >
              <div className="message-role">{m.role === 'user' ? 'You' : 'Octagon AI'}</div>
              <div className="markdown">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  skipHtml
                  components={{
                    a: ({ href, children }) =>
                      safeUrl(href || '') &&
                      new URL(safeUrl(href || '')!).hostname !== 'api.ufcalendar.com' &&
                      (m.role === 'user' ||
                        m.sources?.some((s) => safeUrl(s.url) === safeUrl(href || ''))) ? (
                        <a href={safeUrl(href!)} target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      ) : (
                        <span>{children}</span>
                      ),
                    img: () => null,
                  }}
                >
                  {publicAnswer(m.content) || (busy ? 'Retrieving verified context…' : 'No answer received.')}
                </ReactMarkdown>
              </div>
              {m.role === 'assistant' && m.content && (
                <div className="message-tools">
                  <button
                    aria-label="Copy answer"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(m.content);
                        setCopied(i);
                      } catch {
                        setError('Clipboard unavailable. Select the answer to copy.');
                      }
                    }}
                  >
                    {copied === i ? <Check size={13} /> : <Copy size={13} />}Copy
                  </button>
                  {i === messages.length - 1 && (
                    <button disabled={busy} onClick={retry}>
                      <RotateCcw size={13} />
                      Retry
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button className="button button-ghost" onClick={retry} disabled={busy}>
                Retry
              </button>
            </div>
          )}
          <div ref={bottom} />
        </div>
        <form
          className="chat-compose"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <div className="composer-box">
            <textarea
              aria-label="Ask a UFC question"
              dir={fa ? 'rtl' : 'ltr'}
              maxLength={2500}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about the UFC…"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (!busy) void send(input);
                }
              }}
            />
            {busy ? (
              <button
                type="button"
                aria-label="Stop generation"
                onClick={() => abort.current?.abort()}
              >
                <Square size={17} />
              </button>
            ) : (
              <button type="submit" aria-label="Send question" disabled={!input.trim()}>
                <Send size={17} />
              </button>
            )}
          </div>
          <small>
            Source-grounded answers can still contain errors. Check original sources. No betting
            advice.
          </small>
        </form>
      </section>
    </div>
  );
}
