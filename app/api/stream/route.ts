import { buildTicker } from '@/lib/views';
import { allFeedStatuses } from '@/lib/feeds/core';
import type { StreamPayload } from '@/lib/domain/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const TICK_MS = 5000;
const MAX_MS = 50000;

/** Server-Sent Events: pushes ticker + feed health every 5 s; closes after ~50 s so the browser reconnects (serverless-safe). */
export async function GET(req: Request) {
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const started = Date.now();
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try { controller.close(); } catch { /* already closed */ }
      };
      const push = async () => {
        if (closed) return;
        try {
          const payload: StreamPayload = { ts: new Date().toISOString(), ticker: await buildTicker(), feeds: await allFeedStatuses() };
          if (!closed) controller.enqueue(enc.encode(`event: tick\ndata: ${JSON.stringify(payload)}\n\n`));
        } catch (e) {
          console.error('stream tick failed', e);
          if (!closed) controller.enqueue(enc.encode(': error\n\n'));
        }
        if (Date.now() - started > MAX_MS) close();
      };
      req.signal?.addEventListener?.('abort', close);
      controller.enqueue(enc.encode('retry: 2000\n\n'));
      await push();
      timer = setInterval(() => { void push(); }, TICK_MS);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
}
