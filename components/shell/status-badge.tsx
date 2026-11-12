'use client';

import type { FeedStatus } from '@/lib/domain/types';
import { clockLabel } from '@/lib/time';
import { cn } from '@/lib/utils';

const TONE: Record<string, string> = {
  LIVE: 'text-ok border-ok/40 bg-ok/10',
  SIMULATED: 'text-sim border-sim/40 bg-sim/10',
  STALE: 'text-warn border-warn/40 bg-warn/10',
  ERROR: 'text-destructive border-destructive/40 bg-destructive/10',
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider', TONE?.[status] ?? TONE.SIMULATED, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full bg-current', status === 'LIVE' && 'animate-pulse')} />
      {status}
    </span>
  );
}

/** Per-feed status row: LIVE / SIMULATED / STALE / ERROR + last-updated (Europe/Berlin). */
export function FeedBadges({ feeds }: { feeds: FeedStatus[] | null | undefined }) {
  const list = feeds ?? [];
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {list.map((f: FeedStatus) => (
        <span
          key={f?.feedId}
          title={`${f?.provider ?? ''}${f?.error ? ` — ${f.error}` : ''}`}
          className="inline-flex items-center gap-1.5 rounded bg-card px-1.5 py-1 font-mono text-[10px] text-muted-foreground shadow-sm"
        >
          <StatusPill status={f?.status ?? 'SIMULATED'} />
          <span className="text-foreground">{f?.name}</span>
          <span>{clockLabel(f?.updatedAt) || '—'}</span>
        </span>
      ))}
    </div>
  );
}
