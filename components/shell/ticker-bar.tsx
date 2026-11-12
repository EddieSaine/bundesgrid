'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Radio } from 'lucide-react';
import type { StreamPayload, TickerItem } from '@/lib/domain/types';
import type { StreamMode } from '@/hooks/use-live-stream';
import { cn } from '@/lib/utils';

function deltaTone(t: TickerItem): string {
  const d = t?.delta ?? 0;
  if (!d || t?.goodWhen === 'neutral') return 'text-muted-foreground';
  const good = t?.goodWhen === 'up' ? d > 0 : d < 0;
  return good ? 'text-ok' : 'text-destructive';
}

function Item({ t }: { t: TickerItem }) {
  const d = t?.delta;
  return (
    <Link href={t?.href ?? '/'} className="flex shrink-0 items-center gap-1.5 px-3 font-mono text-[11px] hover:bg-accent">
      <span className={cn('h-1.5 w-1.5 rounded-full', t?.status === 'LIVE' ? 'bg-ok' : t?.status === 'SIMULATED' ? 'bg-sim' : 'bg-warn')} />
      <span className="text-muted-foreground">{t?.label}</span>
      <motion.span
        key={t?.display}
        initial={{ scale: 1.18 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.6 }}
        className="font-semibold text-foreground"
      >
        {t?.display}
        {t?.unit ? <span className="ml-0.5 font-normal text-muted-foreground">{t.unit}</span> : null}
      </motion.span>
      {d !== null && d !== undefined ? (
        <span className={deltaTone(t)} title={t?.deltaLabel}>
          {d > 0 ? '▲' : d < 0 ? '▼' : '■'} {(Math.abs(d) * 100).toFixed(1)}%
        </span>
      ) : null}
    </Link>
  );
}

/** Live ticker fed by the SSE stream; values pulse when they change. */
export function TickerBar({ payload, mode }: { payload: StreamPayload | null; mode: StreamMode }) {
  const items = payload?.ticker ?? [];
  return (
    <div className="flex h-7 items-center overflow-hidden border-b border-border bg-card">
      <div className="relative z-10 flex h-full shrink-0 items-center gap-1.5 bg-primary px-2 font-mono text-[10px] font-bold tracking-widest text-primary-foreground">
        <Radio className="h-3 w-3" />
        {mode === 'sse' ? 'SSE' : mode === 'polling' ? 'POLL' : '···'}
      </div>
      {items.length ? (
        <div className="h-full min-w-0 flex-1 overflow-hidden"><div className="ticker-track flex h-full items-center">
          {[0, 1].map((n: number) => (
            <div key={n} className="flex h-full shrink-0 items-center" aria-hidden={n === 1}>
              {items.map((t: TickerItem) => <Item key={`${n}-${t?.id}`} t={t} />)}
            </div>
          ))}
        </div></div>
      ) : (
        <div className="mx-3 h-3 w-64 animate-pulse rounded bg-muted" />
      )}
    </div>
  );
}
