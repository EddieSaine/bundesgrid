'use client';

import { useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, TriangleAlert } from 'lucide-react';
import { AbacusDashboard, type VizData, type VizManifest } from '@/components/viz/abacus-dashboard';
import { usePoll } from '@/hooks/use-poll';
import { useSettings } from '@/hooks/use-settings';
import { FeedBadges } from '@/components/shell/status-badge';
import type { FeedStatus } from '@/lib/domain/types';
import { cn } from '@/lib/utils';

interface DashResponse {
  data_as_of: string;
  manifest: VizManifest;
  data: VizData;
  feeds: FeedStatus[];
  horizon: string | null;
}

export function DashSkeleton() {
  return (
    <div className="space-y-3 p-3" aria-busy="true" aria-label="Loading dashboard">
      <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i: number) => <div key={i} className="h-24 animate-pulse rounded-md bg-card" />)}</div>
      <div className="h-72 animate-pulse rounded-md bg-card" />
      <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((i: number) => <div key={i} className="h-56 animate-pulse rounded-md bg-card" />)}</div>
    </div>
  );
}

/** One dashboard tab: polls /api/dash/{view} and renders it with the dashboard kit. */
export function DashView({ view }: { view: string }) {
  const horizon = useSettings((s) => s.horizon);
  const refreshMs = useSettings((s) => s.refreshMs);
  const state = useSettings((s) => s.state);
  const qs = `h=${horizon}${state ? `&state=${state}` : ''}`;
  const { data: res, error, loading, refreshing, reload } = usePoll<DashResponse>(`/api/dash/${view}?${qs}`, refreshMs);
  const [dataset, setDataset] = useState('');

  // Keep the manifest object identity stable while its JSON is unchanged, so the kit only re-mounts on real changes.
  const cache = useRef<{ json: string; manifest: VizManifest } | null>(null);
  const manifest = useMemo(() => {
    if (!res?.manifest) return null;
    const json = JSON.stringify(res.manifest);
    if (cache.current?.json !== json) cache.current = { json, manifest: res.manifest };
    return cache.current?.manifest ?? null;
  }, [res?.manifest]);

  const keys = Object.keys((res?.data ?? {}) as Record<string, unknown>);
  const exportHref = (format: 'csv' | 'json') => `/api/export/${view}?format=${format}&${qs}${dataset ? `&dataset=${dataset}` : ''}`;

  if (loading && !res) return <DashSkeleton />;
  if (!res || !manifest) {
    return (
      <div className="m-4 flex items-center gap-3 rounded-md bg-card p-4 text-sm shadow">
        <TriangleAlert className="h-5 w-5 text-destructive" />
        <span>Sorry — this view could not be loaded{error ? ` (${error})` : ''}.</span>
        <button onClick={reload} className="ml-auto rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Retry</button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-1.5">
        <FeedBadges feeds={res?.feeds} />
        <div className="ml-auto flex items-center gap-1.5">
          {error ? <span className="font-mono text-[10px] text-warn" title={error}>refresh failed · showing last good data</span> : null}
          <button onClick={reload} aria-label="Refresh now" title="Refresh now" className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </button>
          <select aria-label="Dataset to export" value={dataset} onChange={(e) => setDataset(e?.target?.value ?? '')} className="h-7 max-w-[10rem] rounded-md border border-border bg-background px-1.5 font-mono text-[11px]">
            <option value="">{`All datasets (${keys.length})`}</option>
            {keys.map((k: string) => <option key={k} value={k}>{k}</option>)}
          </select>
          <a href={exportHref('csv')} title={dataset ? 'Download dataset as CSV' : 'Download first dataset as CSV (pick one for a specific dataset)'} className="flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 font-mono text-[11px] text-foreground hover:bg-accent"><Download className="h-3 w-3" />CSV</a>
          <a href={exportHref('json')} title="Download as JSON" className="flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 font-mono text-[11px] text-foreground hover:bg-accent"><Download className="h-3 w-3" />JSON</a>
        </div>
      </div>
      <AbacusDashboard manifest={manifest} data={res.data} dataAsOf={res.data_as_of} />
    </div>
  );
}
