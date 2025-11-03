export const runtime = 'nodejs';

type InMessage = { role: 'user' | 'assistant' | 'system'; content: string };

// Proxy streaming to backend service
export async function POST(request: Request) {
    const payload = await request.json();
    const messages: InMessage[] | undefined = payload?.messages;
    const lastQuestion = Array.isArray(messages) && messages.length
        ? messages[messages.length - 1]?.content ?? ''
        : (payload?.question ?? '');

    const backendUrl = process.env.BACKEND_BASE_URL || 'http://172.20.0.1:18080';
    const resp = await fetch(`${backendUrl}/chat`, {
        method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
        // Wrap into backend-required shape
        body: JSON.stringify({question: lastQuestion})
    });

    if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => '');
        return new Response(text || `Upstream error: ${resp.status}`, {status: 502});
    }

    // Stream passthrough (supports text/event-stream or chunked text)
    return new Response(resp.body, {
        headers: {
            'Content-Type': resp.headers.get('content-type') || 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}


