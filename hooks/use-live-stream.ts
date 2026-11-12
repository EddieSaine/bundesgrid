'use client';

import { useEffect, useState } from 'react';
import type { StreamPayload } from '@/lib/domain/types';

export type StreamMode = 'connecting' | 'sse' | 'polling';

/** Subscribes to the SSE stream (/api/stream); falls back to polling /api/ticker when SSE is unavailable. */
export function useLiveStream(): { payload: StreamPayload | null; mode: StreamMode } {
  const [payload, setPayload] = useState<StreamPayload | null>(null);
  const [mode, setMode] = useState<StreamMode>('connecting');

  useEffect(() => {
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let failures = 0;
    let stopped = false;

    const pollOnce = async () => {
      try {
        const res = await fetch('/api/ticker', { cache: 'no-store' });
        if (res?.ok && !stopped) setPayload((await res.json()) as StreamPayload);
      } catch (e) {
        console.error('ticker poll failed', e);
      }
    };
    const startPolling = () => {
      if (poll || stopped) return;
      setMode('polling');
      void pollOnce();
      poll = setInterval(() => { void pollOnce(); }, 15000);
    };

    if (typeof EventSource === 'undefined') {
      startPolling();
    } else {
      es = new EventSource('/api/stream');
      es.addEventListener('tick', (ev: MessageEvent) => {
        try {
          const p = JSON.parse(ev?.data ?? '{}') as StreamPayload;
          failures = 0;
          if (!stopped) { setPayload(p); setMode('sse'); }
        } catch (e) {
          console.error('bad stream frame', e);
        }
      });
      es.onerror = () => {
        failures += 1;
        if (failures >= 4) { es?.close?.(); startPolling(); }
      };
    }
    return () => {
      stopped = true;
      es?.close?.();
      if (poll) clearInterval(poll);
    };
  }, []);

  return { payload, mode };
}
