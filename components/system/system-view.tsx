'use client';

import { Activity, Database, ExternalLink, TriangleAlert } from 'lucide-react';
import { usePoll } from '@/hooks/use-poll';
import { useSettings } from '@/hooks/use-settings';
import { StatusPill } from '@/components/shell/status-badge';
import { DashSkeleton } from '@/components/dash/dash-view';
import { dateTimeLabel } from '@/lib/time';
import type { FeedStatus } from '@/lib/domain/types';

interface Health { ts: string; feeds: FeedStatus[]; database: boolean }

function Spark({ values }: { values: number[] }) {
  const v = (values ?? []).slice(-20);
  const max = Math.max(1, ...v);
  return (
    <span className="flex h-4 items-end gap-px" aria-hidden>
      {v.map((x: number, i: number) => <span key={i} className={x < 0 ? 'w-1 bg-destructive' : 'w-1 bg-primary'} style={{ height: x < 0 ? '100%' : `${Math.max(10, (x / max) * 100)}%` }} />)}
    </span>
  );
}

/** Global network-health panel: every feed with status, latency, last update and 24 h success rate. */
export function SystemView() {
  const refreshMs = useSettings((s) => s.refreshMs);
  const { data, error, loading } = usePoll<Health>('/api/health', Math.min(refreshMs || 30000, 30000));
  if (loading && !data) return <DashSkeleton />;
  const feeds = data?.feeds ?? [];
  const count = (s: string) => feeds.filter((f: FeedStatus) => f?.status === s).length;
  return (
    <div className="space-y-3 p-3">
      {error ? <div className="flex items-center gap-2 rounded-md bg-card p-3 text-xs text-warn shadow"><TriangleAlert className="h-4 w-4" />Health endpoint unreachable ({error}).</div> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[['LIVE', 'Live upstream data'], ['SIMULATED', 'Model / fallback'], ['STALE', 'Last good value'], ['ERROR', 'No data']].map(([s, hint]) => (
          <div key={s} className="rounded-md bg-card p-3 shadow"><StatusPill status={s ?? ''} /><div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{count(s ?? '')}</div><div className="text-[10px] text-muted-foreground">{hint}</div></div>
        ))}
        <div className="rounded-md bg-card p-3 shadow"><div className="flex items-center gap-1 font-mono text-[10px] font-semibold tracking-wider text-muted-foreground"><Database className="h-3 w-3" />SNAPSHOT STORE</div><div className="mt-1 font-mono text-lg font-semibold">{data?.database ? 'Database' : 'Memory only'}</div><div className="text-[10px] text-muted-foreground">Checked {dateTimeLabel(data?.ts)}</div></div>
      </div>
      <section className="rounded-md bg-card p-3 shadow">
        <div className="mb-2 flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /><h2 className="font-display text-sm font-semibold">Feed registry</h2><span className="text-[10px] text-muted-foreground">A feed reports status once a tab has requested it; unrequested live feeds show no update time yet.</span></div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground">{['Feed', 'Status', 'Provider', 'Section', 'Cadence', 'Latency', 'Last update', 'Uptime 24h', 'Recent', 'Last error'].map((h: string) => <th key={h} className="whitespace-nowrap p-1.5 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {feeds.map((f: FeedStatus) => (
                <tr key={f?.feedId} className="border-t border-border hover:bg-accent">
                  <td className="whitespace-nowrap p-1.5 font-medium">{f?.name}<div className="font-mono text-[10px] text-muted-foreground">{f?.feedId}</div></td>
                  <td className="p-1.5"><StatusPill status={f?.status ?? ''} /></td>
                  <td className="whitespace-nowrap p-1.5">{f?.homepage ? <a href={f.homepage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">{f?.provider}<ExternalLink className="h-3 w-3" /></a> : f?.provider}</td>
                  <td className="p-1.5 text-muted-foreground">{f?.section}</td>
                  <td className="whitespace-nowrap p-1.5 text-muted-foreground">{f?.cadence}</td>
                  <td className="p-1.5 font-mono tabular-nums">{f?.latencyMs !== null && f?.latencyMs !== undefined ? `${f.latencyMs} ms` : '—'}</td>
                  <td className="whitespace-nowrap p-1.5 font-mono">{dateTimeLabel(f?.updatedAt) || '—'}</td>
                  <td className="p-1.5 font-mono tabular-nums">{f?.uptime24h !== null && f?.uptime24h !== undefined ? `${(f.uptime24h * 100).toFixed(0)}% (${f?.checks24h ?? 0})` : '—'}</td>
                  <td className="p-1.5"><Spark values={f?.recent ?? []} /></td>
                  <td className="max-w-[16rem] truncate p-1.5 text-warn" title={f?.error ?? ''}>{f?.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
