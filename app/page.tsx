"use client";
import {useEffect, useRef, useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {normalizeMarkdown} from './utils/markdown';

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
    // 语音相关状态
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [isMobile, setIsMobile] = useState(false); // 添加设备类型状态
    
    const listRef = useRef<HTMLDivElement>(null);
    const revealBufferRef = useRef<string>('');
    const revealTimerRef = useRef<number | null>(null);
    const currentAssistantIdRef = useRef<string | null>(null);
    // 语音相关引用
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

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

    // 检测设备类型
    useEffect(() => {
        const checkIsMobile = () => {
            if (typeof window !== 'undefined') {
                const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
                const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
                return mobileRegex.test(userAgent);
            }
            return false;
        };

        setIsMobile(checkIsMobile());
    }, []);

    // 清理定时器
    useEffect(() => {
        return () => {
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
            if (revealTimerRef.current) {
                clearInterval(revealTimerRef.current);
            }
        };
    }, []);

    // 检测是否为移动设备
    const isMobileDevice = () => {
        return isMobile;
    };

    // 开始录音
    async function startRecording() {
        if (isStreaming) return;

        try {
            setIsRecording(true);
            setRecordingTime(0);

            // 开始计时
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
            recordingTimerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

            // 启动语音识别
            await transcribeAudio();
        } catch (err) {
            console.error('录音失败:', err);
            alert('无法访问麦克风，请检查权限设置');
            setIsRecording(false);
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
        }
    }

    // 停止录音
    function stopRecording() {
        if (isRecording) {
            setIsRecording(false);
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
        }
    }

    // 切换录音状态（用于桌面端的点击切换模式）
    async function toggleRecording() {
        if (isRecording) {
            stopRecording();
        } else {
            if (isStreaming) return;

            try {
                setIsRecording(true);
                setRecordingTime(0);

                // 开始计时
                if (recordingTimerRef.current) {
                    clearInterval(recordingTimerRef.current);
                }
                recordingTimerRef.current = setInterval(() => {
                    setRecordingTime(prev => prev + 1);
                }, 1000);

                // 启动语音识别
                await transcribeAudio();
            } catch (err) {
                console.error('录音失败:', err);
                alert('无法访问麦克风，请检查权限设置');
                setIsRecording(false);
                if (recordingTimerRef.current) {
                    clearInterval(recordingTimerRef.current);
                    recordingTimerRef.current = null;
                }
            }
        }
    }

    // 语音识别
    async function transcribeAudio() {
        try {
            // 使用 Web Speech API 进行语音识别
            const recognizedText = await speechToText();

            if (recognizedText) {
                setInput(recognizedText);
                // 短暂延迟后自动发送消息
                setTimeout(() => {
                    sendMessage(recognizedText);
                }, 300);
            }
        } catch (err: any) {
            console.error('语音识别失败:', err);
            alert(`语音识别失败: ${err.message || '请重试'}`);
        } finally {
            setIsProcessing(false);
            // 确保录音状态被重置
            setIsRecording(false);
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
        }
    }

    // 使用 Web Speech API 实现语音转文字
    async function speechToText(): Promise<string> {
        return new Promise((resolve, reject) => {
            // 检查浏览器是否支持 Web Speech API
            const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;

            if (!SpeechRecognition) {
                reject(new Error('浏览器不支持语音识别功能，请使用现代浏览器（如Chrome）并启用相关权限'));
                return;
            }

            const recognition = new SpeechRecognition();
            recognition.lang = 'zh-CN'; // 设置语言为中文
            recognition.interimResults = false; // 只获取最终结果
            recognition.maxAlternatives = 1; // 只获取一个识别结果
            recognition.continuous = false; // 只识别一次就结束

            let recognitionTimeout: NodeJS.Timeout | null = null;

            recognition.onstart = () => {
                console.log('语音识别开始');
                // 设置超时
                recognitionTimeout = setTimeout(() => {
                    recognition.stop();
                    reject(new Error('语音识别超时，请说话或重试'));
                }, 10000);
            };

            recognition.onresult = (event: any) => {
                // 清除超时定时器
                if (recognitionTimeout) {
                    clearTimeout(recognitionTimeout);
                    recognitionTimeout = null;
                }

                if (event.results && event.results.length > 0 && event.results[0].isFinal) {
                    const transcript = event.results[0][0].transcript;
                    console.log('识别结果:', transcript);
                    resolve(transcript);
                } else {
                    reject(new Error('未识别到有效语音内容'));
                }
            };

            recognition.onerror = (event: any) => {
                // 清除超时定时器
                if (recognitionTimeout) {
                    clearTimeout(recognitionTimeout);
                    recognitionTimeout = null;
                }
                console.error('语音识别出错:', event);
                reject(new Error(`语音识别出错: ${event.error || '未知错误'}`));
            };

            recognition.onend = () => {
                // 清除超时定时器
                if (recognitionTimeout) {
                    clearTimeout(recognitionTimeout);
                    recognitionTimeout = null;
                }
                console.log('语音识别结束');
            };

            try {
                // 开始语音识别
                recognition.start();
            } catch (err) {
                if (recognitionTimeout) {
                    clearTimeout(recognitionTimeout);
                    recognitionTimeout = null;
                }
                reject(new Error('语音识别初始化失败'));
            }
        });
    }

    async function sendMessage(customInput?: string) {
        const messageContent = customInput || input;
        if (!messageContent.trim() || isStreaming) return;
        const userMsg: ChatMessage = {id: crypto.randomUUID(), role: 'user', content: messageContent.trim()};
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

    // 格式化录音时间显示
    function formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    return (
        <div className="container">
            <div className="card">
                <div className="header">
                    <div className="title">AI Chat UI</div>
                    <div style={{color: '#64748b', fontSize: 12}}>
                        {isStreaming ? '生成中…' : isRecording ? `录音中 ${formatTime(recordingTime)}` : '就绪'}
                    </div>
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
                        disabled={isStreaming || isRecording || isProcessing}
                    />
                    <div className="voiceButtonContainer">
                        {isMobileDevice() ? (
                            // 移动端使用长按交互
                            <button
                                className={`voiceButton ${isRecording ? 'recording' : ''}`}
                                onMouseDown={startRecording}
                                onMouseUp={stopRecording}
                                onMouseLeave={stopRecording}
                                onTouchStart={(e) => {
                                    e.preventDefault();
                                    startRecording();
                                }}
                                onTouchEnd={(e) => {
                                    e.preventDefault();
                                    stopRecording();
                                }}
                                disabled={isStreaming || isProcessing}
                                title="按住说话"
                            >
                                {isRecording ? '松开结束' : '按住说话'}
                            </button>
                        ) : (
                            // 桌面端使用点击切换交互
                            <button
                                className={`voiceButton ${isRecording ? 'recording' : ''}`}
                                onClick={toggleRecording}
                                disabled={isStreaming || isProcessing}
                                title="语音输入"
                            >
                                {isRecording ? '停止录音' : '语音输入'}
                            </button>
                        )}
                    </div>
                    {isStreaming ? (
                        <button className="button secondary" onClick={stopStream}>停止</button>
                    ) : (
                        <button className="button" onClick={() => sendMessage()}
                                disabled={!input.trim() || isRecording || isProcessing}>
                            发送
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}