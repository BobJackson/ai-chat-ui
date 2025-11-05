"use client";
import {useEffect, useRef, useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
};

const CONVERSATION_ID_KEY = 'ai-chat-conversation-id';

export default function Page() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [abortController, setAbortController] = useState<AbortController | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const revealBufferRef = useRef<string>('');
    const revealTimerRef = useRef<number | null>(null);
    const currentAssistantIdRef = useRef<string | null>(null);

    // 获取或生成conversationId
    const getOrCreateConversationId = (): string => {
        if (typeof window === 'undefined') return '';
        let conversationId = localStorage.getItem(CONVERSATION_ID_KEY);
        if (!conversationId) {
            conversationId = crypto.randomUUID();
            localStorage.setItem(CONVERSATION_ID_KEY, conversationId);
        }
        return conversationId;
    };

    useEffect(() => {
        listRef.current?.scrollTo({top: listRef.current.scrollHeight});
    }, [messages.length]);

    function normalizeMarkdown(input: string): string {
        let output = input
            // 1️⃣ 清理多余空格与控制符
            .replace(/\r/g, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/ +\n/g, '\n')
            .trim();

        // 2️⃣ 修复常见错误分隔符与破折号
        output = output
            .replace(/—{2,}/g, '—')
            .replace(/—/g, '-') // 替换为 Markdown 用短横线
            .replace(/- -/g, '-')
            .replace(/[-–—]{3,}/g, '\n\n---\n\n'); // 规范分隔线

        // 3️⃣ 标题规范化
        output = output
            .replace(/(#+)\s*/g, '$1 ')
            .replace(/###\s*\*\*(.*?)\*\*/g, '### $1')
            .replace(/####\s*\*\*(.*?)\*\*/g, '#### $1')
            .replace(/###\s*(.*?)($|\n)/g, '\n\n### $1\n\n')
            .replace(/####\s*(.*?)($|\n)/g, '\n\n#### $1\n\n');

        // 4️⃣ 智能识别时段标题
        output = output.replace(/(\*\*.*?(上午|下午|晚上)：.*?\*\*)/g, '\n\n#### $1\n');

        // 5️⃣ 规范时间节点与无序列表
        output = output
            .replace(/-?\s*\*\*(\d{1,2}:\d{2})\*\*[:：]?\s*/g, '\n- **$1**：')
            .replace(/\n\s*-\s*\*\*/g, '\n- **');

        // 6️⃣ 修复被错误拆断的数字或范围
        output = output
            .replace(/(\d+)\s*-\s*(\d+)/g, '$1-$2')
            .replace(/(\d+)\s*—\s*(\d+)/g, '$1-$2');

        // 7️⃣ 清理空行、保持段落结构
        output = output
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\n{2,}(- \*\*)/g, '\n$1')
            .replace(/(- \*\*.*?\n)\n(- \*\*)/g, '$1$2');

        // 8️⃣ 确保标题间距
        output = output.replace(/(###|####)(.*?)(\S)/g, '$1$2\n\n$3');

        // 9️⃣ 🧹 清理空的无序列表项（重点改进）
        output = output
            .replace(/^-+\s*$/gm, '') // 删除只有破折号的行
            .replace(/^\s*-\s*([·•]*)?\s*$/gm, '') // 删除空的 bullet 列表项
            .replace(/\n{2,}\n/g, '\n\n'); // 重新规整空行

        // 🔟 结尾/开头清理
        output = output.trim();
        if (!output.startsWith('\n')) output = '\n' + output;
        if (!output.endsWith('\n')) output += '\n';

        console.log('Normalized Markdown:', output)

        return output;
    }

    async function sendMessage() {
        if (!input.trim() || isStreaming) return;
        const userMsg: ChatMessage = {id: crypto.randomUUID(), role: 'user', content: input.trim()};
        const assistantMsg: ChatMessage = {id: crypto.randomUUID(), role: 'assistant', content: ''};
        setMessages(prev => [...prev, userMsg, assistantMsg]);
        currentAssistantIdRef.current = assistantMsg.id;
        setInput('');

        const ac = new AbortController();
        setAbortController(ac);
        setIsStreaming(true);

        try {
            const conversationId = getOrCreateConversationId();
            const resp = await fetch('/api/chat', {
                method: 'POST',
                body: JSON.stringify({
                    messages: [...messages, userMsg].map(m => ({role: m.role, content: m.content})),
                    conversationId: conversationId
                }),
                headers: {'Content-Type': 'application/json'},
                signal: ac.signal
            });
            if (!resp.ok || !resp.body) throw new Error(`Request failed: ${resp.status}`);

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let done = false;
            let sseBuffer = '';
            let sawSSE = false;

            const flushTypingStart = () => {
                if (revealTimerRef.current != null) return;
                // Typing effect: reveal 2 chars every 16ms (~120 cps)
                revealTimerRef.current = window.setInterval(() => {
                    const take = 2;
                    if (!revealBufferRef.current.length) return;
                    const chunk = revealBufferRef.current.slice(0, take);
                    revealBufferRef.current = revealBufferRef.current.slice(take);
                    const targetId = currentAssistantIdRef.current;
                    if (!targetId) return;
                    setMessages(prev => prev.map(m => m.id === targetId ? {...m, content: m.content + chunk} : m));
                }, 16);
            };
            while (!done) {
                const {value, done: doneReading} = await reader.read();
                done = doneReading;
                if (value) {
                    const chunk = decoder.decode(value, {stream: true});
                    sseBuffer += chunk;

                    // Prefer immediate line-level consumption for SSE to reduce latency
                    let nlIndex: number;
                    while ((nlIndex = sseBuffer.indexOf('\n')) !== -1) {
                        const line = sseBuffer.slice(0, nlIndex);
                        sseBuffer = sseBuffer.slice(nlIndex + 1);
                        if (line.startsWith('data:')) {
                            sawSSE = true;
                            const data = line.replace(/^data:\s?/, '');
                            if (!data) continue;
                            if (data === '[DONE]') {
                                done = true;
                                break;
                            }
                            // queue into typing buffer instead of direct render
                            revealBufferRef.current += data;
                            flushTypingStart();
                        } else if (line.trim() === '') {
                            // possibly end of event block, ignore
                        } else if (!sawSSE) {
                            // Not SSE: treat as plain text
                            revealBufferRef.current += line + '\n';
                            flushTypingStart();
                        }
                    }
                }
            }
            // Flush any remaining buffer
            if (sawSSE && sseBuffer) {
                const lines = sseBuffer.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        const data = line.replace(/^data:\s?/, '');
                        if (data && data !== '[DONE]') {
                            revealBufferRef.current += data;
                        }
                    }
                }
            } else if (!sawSSE && sseBuffer) {
                revealBufferRef.current += sseBuffer;
            }
        } catch (err) {
            setMessages(prev => prev.map(m => m.id === assistantMsg.id ? {
                ...m,
                content: (m.content || '') + '\n[流式已中断]'
            } : m));
        } finally {
            // stop typing interval and append any remaining instantly
            if (revealTimerRef.current != null) {
                window.clearInterval(revealTimerRef.current);
                revealTimerRef.current = null;
            }
            const remain = revealBufferRef.current;
            if (remain && currentAssistantIdRef.current) {
                const targetId = currentAssistantIdRef.current;
                setMessages(prev => prev.map(m => m.id === targetId ? {...m, content: m.content + remain} : m));
            }
            // normalize the final assistant message once stream is done
            setMessages(prev => prev.map(m => m.id === assistantMsg.id && m.role === 'assistant'
                ? {...m, content: normalizeMarkdown(m.content)}
                : m
            ));
            revealBufferRef.current = '';
            setIsStreaming(false);
            setAbortController(null);
            currentAssistantIdRef.current = null;
        }
    }

    function stopStream() {
        abortController?.abort();
        if (revealTimerRef.current != null) {
            window.clearInterval(revealTimerRef.current);
            revealTimerRef.current = null;
        }
    }

    return (
        <div className="container">
            <div className="card">
                <div className="header">
                    <div className="title">AI Chat UI</div>
                    <div style={{color: '#64748b', fontSize: 12}}>{isStreaming ? '生成中…' : '就绪'}</div>
                </div>
                <div className="messages" ref={listRef}>
                    {messages.length === 0 && (
                        <div style={{color: '#64748b'}}>开始对话吧，输入你的问题并发送。</div>
                    )}
                    {messages.map(m => (
                        <div key={m.id} className={`row ${m.role}`}>
                            <div className={`bubble ${m.role}`}>
                                {m.role === 'assistant' ? (
                                    <div className="md">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            rehypePlugins={[rehypeHighlight]}
                                            components={{
                                                a: ({children, ...props}) => (
                                                    <a {...props} target="_blank"
                                                       rel="noopener noreferrer">{children}</a>
                                                )
                                            }}
                                        >
                                            {m.content}
                                        </ReactMarkdown>
                                    </div>
                                ) : (
                                    m.content
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="inputBar">
                    <input
                        className="textInput"
                        placeholder="来说点什么…"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                            }
                        }}
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


