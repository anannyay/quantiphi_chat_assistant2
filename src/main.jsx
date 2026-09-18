import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUp, ArrowUpRight, AudioLines, BookOpen, Check, ChevronDown, Code2, Copy, Download, Feather, Menu, MessageSquare, Plus, Search, Sparkles, Square, Trash2, X, Zap, Briefcase, Smile, CircleHelp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, readEvents } from './api';
import './styles.css';

const tones = [{ id: 'professional', label: 'Professional', icon: Briefcase, detail: 'Clear, structured, and polished.' }, { id: 'casual', label: 'Casual', icon: Smile, detail: 'Friendly, natural, and easygoing.' }, { id: 'concise', label: 'Concise', icon: Zap, detail: 'Less noise. Straight to the point.' }];
const starters = [
  { icon: Feather, label: 'Find the right words', text: 'Draft a thoughtful email', prompt: 'Help me write a professional follow-up email after a job interview.' },
  { icon: BookOpen, label: 'Make it make sense', text: 'Break down a big idea', prompt: 'Explain how large language models work using a simple analogy.' },
  { icon: Code2, label: 'Build something better', text: 'Think through a problem', prompt: 'How should I structure a scalable full-stack chat application?' },
  { icon: Sparkles, label: 'Explore the possibilities', text: 'Give an idea a new angle', prompt: 'Brainstorm five creative ways to make studying more engaging.' }
];
const time = value => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Message({ message }) {
  const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(message.content); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); } }
  const isAI = message.role === 'assistant';
  return <article className={`message ${isAI ? 'assistant' : 'user'}`}>
    <div className={`avatar ${isAI ? 'ai-avatar' : ''}`}>{isAI ? <AudioLines size={17}/> : 'Y'}</div>
    <div className="message-main"><div className="message-meta"><strong>{isAI ? 'Cadence' : 'You'}</strong><span>{time(message.createdAt)}</span>{isAI && <span className="tone-tag">{message.tone}</span>}</div>
      <div className="bubble">{message.content ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: props => <a {...props} target="_blank" rel="noopener noreferrer"/>, img: () => null }}>{message.content}</ReactMarkdown> : <span className="thinking">Thinking<span>···</span></span>}{message.status === 'streaming' && message.content && <span className="stream-cursor"/>}</div>
      {isAI && message.status !== 'streaming' && <div className="message-tools"><button onClick={copy} aria-label="Copy response">{copied ? <Check size={14}/> : <Copy size={14}/>} {copied ? 'Copied' : 'Copy'}</button>{message.status !== 'complete' && <span className="incomplete">{message.status === 'interrupted' ? 'Response stopped' : 'Response incomplete'}</span>}</div>}
    </div>
  </article>;
}

function App() {
  const [threads, setThreads] = useState([]), [current, setCurrent] = useState(null), [messages, setMessages] = useState([]);
  const [tone, setTone] = useState('professional'), [prompt, setPrompt] = useState(''), [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [health, setHealth] = useState(null);
  const [sidebar, setSidebar] = useState(false), [help, setHelp] = useState(false), [deleteTarget, setDeleteTarget] = useState(null);
  const abort = useRef(null), end = useRef(null), input = useRef(null), scroll = useRef(null), follow = useRef(true), sending = useRef(false);
  const selection = useRef(0);
  async function refresh() { const list = await api('/conversations'); setThreads(list); }
  useEffect(() => { Promise.all([api('/health').then(setHealth), refresh()]).catch(e => setError(e.message)).finally(() => setLoading(false)); return () => abort.current?.abort(); }, []);
  useEffect(() => { if (follow.current) end.current?.scrollIntoView({ behavior: 'instant', block: 'end' }); }, [messages]);
  async function select(thread) {
    if (sending.current) return;
    const ticket = ++selection.current; setLoading(true); setError('');
    try { const data = await api(`/conversations/${thread.id}`); if (ticket !== selection.current) return; setCurrent(data); setMessages(data.messages); follow.current = true; setSidebar(false); }
    catch(e) { setError(e.message); } finally { if (ticket === selection.current) setLoading(false); }
  }
  function newChat() { if (sending.current) return; selection.current++; setCurrent(null); setMessages([]); setPrompt(''); setError(''); setLoading(false); setSidebar(false); input.current?.focus(); }
  async function send(event) {
    event?.preventDefault(); if (!prompt.trim() || sending.current || loading) return;
    sending.current = true; setBusy(true); setError(''); follow.current = true;
    const text = prompt.trim(); setPrompt(''); let thread = current, started = false;
    abort.current = new AbortController();
    try {
      if (!thread) { thread = await api('/conversations', { method: 'POST' }); setCurrent(thread); }
      const response = await fetch(`/api/conversations/${thread.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: text, tone }), signal: abort.current.signal });
      await readEvents(response, event => {
        if (event.type === 'start') { started = true; setCurrent(t => ({ ...t, title: event.title })); setMessages(list => [...list, event.user, event.assistant]); }
        if (event.type === 'delta') setMessages(list => list.map((m, i) => i === list.length - 1 ? { ...m, content: m.content + event.delta } : m));
        if (event.type === 'done') setMessages(list => list.map((m, i) => i === list.length - 1 ? event.message : m));
      });
    } catch(e) {
      if (e.name !== 'AbortError') setError(e.message);
      if (!started) setPrompt(text);
      setMessages(list => list.map(m => m.status === 'streaming' ? { ...m, status: e.name === 'AbortError' ? 'interrupted' : 'error' } : m));
    } finally { sending.current = false; setBusy(false); abort.current = null; refresh().catch(e => setError(e.message)); input.current?.focus(); }
  }
  async function remove() {
    try { await api(`/conversations/${deleteTarget.id}`, { method: 'DELETE' }); if (current?.id === deleteTarget.id) newChat(); setDeleteTarget(null); await refresh(); } catch(e) { setError(e.message); setDeleteTarget(null); }
  }
  function exportChat() {
    const text = `# ${current.title}\n\n` + messages.map(m => `## ${m.role === 'user' ? 'You' : 'Cadence'} · ${m.tone}\n\n${m.content}\n\n_${m.createdAt} · ${m.status}_`).join('\n\n---\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' })); const a = document.createElement('a'); a.href = url; a.download = 'cadence-conversation.md'; a.click(); URL.revokeObjectURL(url);
  }
  const activeTone = tones.find(t => t.id === tone);
  return <div className="app-shell">
    {sidebar && <button className="sidebar-backdrop" aria-label="Close sidebar" onClick={() => setSidebar(false)}/>}
    <aside className={`sidebar ${sidebar ? 'open' : ''}`}>
      <a className="brand" href="/" aria-label="Cadence home"><span className="brand-mark"><AudioLines size={24}/></span>cadence<span className="brand-period">.</span></a>
      <button className="new-chat" onClick={newChat} disabled={busy}><Plus size={18}/> New conversation <span>↗</span></button>
      <label className="search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search conversations" aria-label="Search conversations"/><span>⌕</span></label>
      <div className="history-label">YOUR CONVERSATIONS <span>{threads.length.toString().padStart(2, '0')}</span></div>
      <nav className="history" aria-label="Conversation history">
        {threads.filter(t => t.title.toLowerCase().includes(query.toLowerCase())).map(t => <div key={t.id} className={`thread ${current?.id === t.id ? 'selected' : ''}`}><button disabled={busy} onClick={() => select(t)}><MessageSquare size={16}/><span>{t.title}</span></button><button className="delete-thread" disabled={busy} aria-label={`Delete ${t.title}`} onClick={() => setDeleteTarget(t)}><Trash2 size={14}/></button></div>)}
        {!threads.length && <div className="history-empty"><MessageSquare size={23}/><p>A little room for<br/>your next big thought.</p><span>Your conversations will live here.</span></div>}
        {!!threads.length && !threads.some(t => t.title.toLowerCase().includes(query.toLowerCase())) && <p className="no-results">No matching conversations.</p>}
      </nav>
      <div className="sidebar-bottom"><div className="workspace-note"><span className="small-orbit">✳</span><strong>A space to think out loud.</strong><p>Start curious. Leave with clarity.</p></div><button className="help-link" onClick={() => setHelp(true)}><CircleHelp size={17}/> About this workspace <ArrowUpRight size={15}/></button><div className="profile"><span className="profile-icon">Y</span><div><strong>Your workspace</strong><span>Personal · {health?.mode === 'live' ? 'Live AI' : 'Demo mode'}</span></div><span className="profile-dot"/></div></div>
    </aside>
    <main>
      <header className="topbar"><div className="breadcrumb"><button className="menu-button icon-button" onClick={() => setSidebar(true)} aria-label="Open sidebar"><Menu size={20}/></button><span>Workspace</span><span className="slash">/</span><strong>{current ? 'Conversation' : 'New conversation'}</strong></div><div className="top-actions">{current && messages.length > 0 && <button className="icon-button" onClick={exportChat} disabled={busy} title="Export as Markdown" aria-label="Export conversation"><Download size={17}/></button>}<span className={`mode-badge ${health?.mode === 'live' ? 'live' : ''}`}><span/>{health ? health.mode === 'live' ? 'Live AI' : 'Demo workspace' : 'Connecting'}</span></div></header>
      <div className="conversation-scroll" ref={scroll} onScroll={() => { const el = scroll.current; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; }}>
        {messages.length === 0 ? <section className="welcome"><div className="intro-eyebrow"><span/> A LITTLE CURIOSITY GOES A LONG WAY</div><div className="welcome-symbol"><AudioLines size={40} strokeWidth={1.7}/></div><h1>Good ideas start<br/>with a <em>conversation.</em></h1><p className="intro-copy">A question, a rough idea, a fresh perspective.<br/>Whatever’s on your mind, let’s make something of it.</p><div className="starter-grid">{starters.map(({ icon: Icon, label, text, prompt }) => <button key={label} className="starter" disabled={loading || busy} onClick={() => { setPrompt(prompt); input.current?.focus(); }}><div className="starter-top"><Icon size={20}/><ArrowUpRight size={16}/></div><strong>{label}</strong><span>{text}</span></button>)}</div><div className="welcome-footnote"><span/> YOUR IDEAS. YOUR PACE. YOUR TONE.</div></section> : <section className="messages" aria-label="Conversation"><div className="conversation-heading"><span>THE CONVERSATION</span><span>{new Date(current?.createdAt || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span></div>{messages.map(m => <Message key={m.id} message={m}/>)}</section>}
        <div ref={end}/>
      </div>
      <div className="composer-region"><div className="composer-inner">
        {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
        <div className="tone-row"><span className="tone-label">Set the tone</span><div className="tone-options" role="group" aria-label="Response tone">{tones.map(({id, label, icon: Icon}) => <button key={id} aria-pressed={tone === id} className={tone === id ? 'active' : ''} onClick={() => setTone(id)} disabled={busy}><Icon size={14}/>{label}</button>)}</div><span className="tone-hint">{activeTone.detail}</span></div>
        <form className={`composer ${busy ? 'generating' : ''}`} onSubmit={send}><label className="sr-only" htmlFor="prompt">Your message</label><textarea id="prompt" ref={input} placeholder={loading ? 'Loading your workspace…' : 'What’s on your mind?'} value={prompt} maxLength={8000} rows={2} disabled={loading} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}/><div className="composer-bottom"><span><AudioLines size={15}/> {busy ? 'Cadence is thinking with you…' : 'A fresh perspective starts here'}</span>{busy ? <button type="button" className="send-button stop" onClick={() => abort.current?.abort()} aria-label="Stop generating"><Square size={16} fill="currentColor"/></button> : <button className="send-button" disabled={!prompt.trim() || loading} aria-label="Send message"><ArrowUp size={21}/></button>}</div></form>
        <div className="composer-footer"><span>{health?.mode === 'live' ? 'AI can make mistakes. Check important details.' : 'Demo mode · Scripted replies. Connect OpenAI for live answers.'}</span><span><kbd>Enter</kbd> to send · <kbd>Shift + Enter</kbd> for a new line</span></div>
      </div></div>
    </main>
    {(help || deleteTarget) && <div className="modal-overlay" onClick={() => { setHelp(false); setDeleteTarget(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><button className="modal-close icon-button" aria-label="Close dialog" autoFocus onClick={() => { setHelp(false); setDeleteTarget(null); }}><X size={20}/></button>{deleteTarget ? <><Trash2 size={28}/><h2 id="modal-title">Delete this conversation?</h2><p>“{deleteTarget.title}” and its messages will be permanently removed.</p><div className="modal-actions"><button onClick={() => setDeleteTarget(null)}>Keep conversation</button><button className="danger" onClick={remove}>Delete conversation</button></div></> : <><span className="brand-mark"><AudioLines size={25}/></span><h2 id="modal-title">Meet your thinking space.</h2><p>Cadence keeps your conversations together and helps you find the right words in the right tone.</p><dl><dt>Response engine</dt><dd>{health?.model || 'Unavailable'}</dd><dt>History storage</dt><dd>{health?.storage || 'Unavailable'}</dd><dt>Current tone</dt><dd>{activeTone.label}</dd></dl><p className="modal-note">{health?.mode === 'live' ? 'Your messages are sent to OpenAI and stored in MongoDB.' : 'Demo replies are scripted examples, not AI-generated answers. Conversation history is saved locally on the server.'}</p></>}</section></div>}
    <span className="sr-only" role="status" aria-live="polite">{busy ? 'Generating response' : loading ? 'Loading conversation' : 'Ready'}</span>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
