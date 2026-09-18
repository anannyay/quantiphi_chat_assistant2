import React, { useState } from 'react';
import { AudioLines, Check, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
const time = (value) =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function Message({ message }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  const isAI = message.role === 'assistant';
  return (
    <article className={`message ${isAI ? 'assistant' : 'user'}`}>
      <div className={`avatar ${isAI ? 'ai-avatar' : ''}`}>
        {isAI ? <AudioLines size={17} /> : 'Y'}
      </div>
      <div className="message-main">
        <div className="message-meta">
          <strong>{isAI ? 'Cadence' : 'You'}</strong>
          <span>{time(message.createdAt)}</span>
          {isAI && <span className="tone-tag">{message.tone}</span>}
        </div>
        <div className="bubble">
          {message.content ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                img: () => null,
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : message.status === 'streaming' ? (
            <span className="thinking">
              Thinking<span>···</span>
            </span>
          ) : (
            <span className="incomplete">No response text was received.</span>
          )}
          {message.status === 'streaming' && message.content && <span className="stream-cursor" />}
        </div>
        {isAI && message.status !== 'streaming' && (
          <div className="message-tools">
            <button onClick={copy} aria-label="Copy response">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
            {message.status !== 'complete' && (
              <span className="incomplete">
                {message.status === 'interrupted' ? 'Response stopped' : 'Response incomplete'}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
