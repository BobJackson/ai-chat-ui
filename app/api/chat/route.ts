export const runtime = 'edge';

type InMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export async function POST(request: Request) {
  const { messages } = (await request.json()) as { messages: InMessage[] };
  const last = messages?.[messages.length - 1]?.content ?? '';

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Simple demo streamer: echos and adds tips token-by-token
      const reply = `你说：${last}\n这是一个流式演示：`;
      const tokens = (reply + ' ✅✅✅\n').split('');
      for (const token of tokens) {
        controller.enqueue(encoder.encode(token));
        await new Promise(r => setTimeout(r, 20));
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}


