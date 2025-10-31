"use client";
import { useEffect, useRef, useState } from 'react';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export default function Page() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  async function sendMessage() {
    if (!input.trim() || isStreaming) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: input.trim() };
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '' };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');

    const ac = new AbortController();
    setAbortController(ac);
    setIsStreaming(true);

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })) }),
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal
      });
      if (!resp.ok || !resp.body) throw new Error(`Request failed: ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value);
          setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: m.content + chunk } : m));
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: (m.content || '') + '\n[流式已中断]' } : m));
    } finally {
      setIsStreaming(false);
      setAbortController(null);
    }
  }

  function stopStream() {
    abortController?.abort();
  }

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <div className="title">AI Chat UI</div>
          <div style={{ color: '#64748b', fontSize: 12 }}>{isStreaming ? '生成中…' : '就绪'}</div>
        </div>
        <div className="messages" ref={listRef}>
          {messages.length === 0 && (
            <div style={{ color: '#64748b' }}>开始对话吧，输入你的问题并发送。</div>
          )}
          {messages.map(m => (
            <div key={m.id} className={`row ${m.role}`}>
              <div className={`bubble ${m.role}`}>{m.content}</div>
            </div>
          ))}
        </div>
        <div className="inputBar">
          <input
            className="textInput"
            placeholder="来说点什么…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button className="button secondary" onClick={stopStream}>停止</button>
          ) : (
            <button className="button" onClick={sendMessage} disabled={!input.trim()}>发送</button>
          )}
        </div>
      </div>
    </div>
  );
}


