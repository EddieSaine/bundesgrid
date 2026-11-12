'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowDownUp, Download, GitCompare, MapPinned, Search, TriangleAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MAP_VIEWBOX, STATE_LABEL_POS, STATE_PATHS } from '@/lib/geo/state-paths';
import { usePoll } from '@/hooks/use-poll';
import { useSettings } from '@/hooks/use-settings';
import { FeedBadges } from '@/components/shell/status-badge';
import { DashSkeleton } from '@/components/dash/dash-view';
import { toCsv } from '@/lib/csv';
import type { FeedStatus, StateRow } from '@/lib/domain/types';
import { cn } from '@/lib/utils';

interface Metric { id: string; label: string; unit: string; decimals: number; group: string; source: string; live: boolean; higherIsBetter: boolean | null }
interface StatesResponse { data_as_of: string; rows: StateRow[]; metrics: Metric[]; feeds: FeedStatus[] }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const fmt = (v: unknown, d: number): string => {
  const n = num(v);
  return n === null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
};

function download(name: string, text: string, type: string) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('download failed', e);
  }
}

export function StatesView() {
  const sp = useSearchParams();
  const refreshMs = useSettings((s) => s.refreshMs);
  const filterState = useSettings((s) => s.state);
  const { data: res, error, loading, reload } = usePoll<StatesResponse>('/api/states', refreshMs);
  const metrics = useMemo(() => res?.metrics ?? [], [res?.metrics]);
  const rows = useMemo(() => res?.rows ?? [], [res?.rows]);
  const [metricId, setMetricId] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: '', dir: -1 });
  const [compare, setCompare] = useState<string[]>([]);

  const spMetric = sp?.get?.('metric') ?? '';
  const spState = sp?.get?.('state') ?? '';
  useEffect(() => { if (spMetric) setMetricId(spMetric); }, [spMetric]);
  useEffect(() => { if (spState) setOpen(spState); }, [spState]);

  const metric: Metric | undefined = metrics.find((m: Metric) => m.id === metricId) ?? metrics?.[0];
  const mid = metric?.id ?? '';
  const values = rows.map((r: StateRow) => num(r?.[mid])).filter((v: number | null): v is number => v !== null);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const alpha = (v: number | null): number => (v === null ? 0.04 : 0.14 + 0.86 * (max > min ? (v - min) / (max - min) : 0.5));
  const byCode = useMemo(() => Object.fromEntries(rows.map((r: StateRow) => [r.code, r])) as Record<string, StateRow>, [rows]);
  const groups = useMemo(() => Array.from(new Set(metrics.map((m: Metric) => m.group))), [metrics]);

  const sortKey = sort.key || mid;
  const tableRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r: StateRow) => !needle || `${r?.name} ${r?.code} ${r?.capital ?? ''} ${r?.region ?? ''}`.toLowerCase().includes(needle));
    return [...list].sort((a: StateRow, b: StateRow) => {
      const x = a?.[sortKey]; const y = b?.[sortKey];
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir;
      return String(x ?? '').localeCompare(String(y ?? '')) * sort.dir;
    });
  }, [rows, q, sortKey, sort.dir]);

  const toggleSort = (key: string) => setSort((s) => ({ key, dir: (s.key || mid) === key ? (s.dir === 1 ? -1 : 1) : -1 }));
  const toggleCompare = (code: string) => setCompare((c: string[]) => (c.includes(code) ? c.filter((x: string) => x !== code) : [...c, code].slice(-4)));
  const rank = (code: string): number => [...rows].sort((a: StateRow, b: StateRow) => (num(b?.[mid]) ?? -Infinity) - (num(a?.[mid]) ?? -Infinity)).findIndex((r: StateRow) => r.code === code) + 1;

  if (loading && !res) return <DashSkeleton />;
  if (!res) {
    return (
      <div className="m-4 flex items-center gap-3 rounded-md bg-card p-4 text-sm shadow">
        <TriangleAlert className="h-5 w-5 text-destructive" />Sorry — state data could not be loaded{error ? ` (${error})` : ''}.
        <button onClick={reload} className="ml-auto rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Retry</button>
      </div>
    );
  }

  const sel = open ? byCode?.[open] : undefined;
  const hv = hover ? byCode?.[hover] : undefined;
  const cmpRows = compare.map((c: string) => byCode?.[c]).filter((r: StateRow | undefined): r is StateRow => !!r);

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <FeedBadges feeds={res?.feeds} />
        <div className="ml-auto flex gap-1.5">
          <button onClick={() => download('deutschland-states.csv', toCsv(rows), 'text/csv')} className="flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 font-mono text-[11px] hover:bg-accent"><Download className="h-3 w-3" />CSV</button>
          <button onClick={() => download('deutschland-states.json', JSON.stringify(rows, null, 2), 'application/json')} className="flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 font-mono text-[11px] hover:bg-accent"><Download className="h-3 w-3" />JSON</button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-md bg-card p-3 shadow">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <MapPinned className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-semibold">Choropleth by Bundesland</h2>
            <select aria-label="Map metric" value={mid} onChange={(e) => { setMetricId(e?.target?.value ?? ''); setSort({ key: '', dir: -1 }); }} className="ml-auto h-7 max-w-full rounded-md border border-border bg-background px-1.5 text-xs">
              {groups.map((g: string) => (
                <optgroup key={g} label={g}>
                  {metrics.filter((m: Metric) => m.group === g).map((m: Metric) => <option key={m.id} value={m.id}>{m.label}{m.live ? ' (live)' : ''}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="relative">
            <svg viewBox={`0 0 ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`} className="mx-auto h-auto max-h-[70vh] w-full" role="img" aria-label={`Map of Germany coloured by ${metric?.label ?? 'metric'}`}>
              {Object.entries(STATE_PATHS ?? {}).map(([code, d]: [string, string]) => {
                const v = num(byCode?.[code]?.[mid]);
                const dim = !!filterState && filterState !== code;
                return (
                  <path
                    key={code}
                    d={d}
                    onMouseEnter={() => setHover(code)}
                    onMouseLeave={() => setHover((h: string | null) => (h === code ? null : h))}
                    onClick={() => setOpen(code)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e?.key === 'Enter') setOpen(code); }}
                    aria-label={`${byCode?.[code]?.name ?? code}: ${fmt(v, metric?.decimals ?? 0)} ${metric?.unit ?? ''}`}
                    className={cn('cursor-pointer stroke-background outline-none transition-all duration-300', hover === code || compare.includes(code) ? 'stroke-foreground' : '', dim && 'opacity-30')}
                    style={{ fill: `hsl(var(--primary) / ${alpha(v).toFixed(3)})`, strokeWidth: hover === code ? 2.2 : 1 }}
                  />
                );
              })}
              {Object.entries(STATE_LABEL_POS ?? {}).map(([code, p]: [string, [number, number]]) => {
                const pos: [number, number] = code === 'BB' ? [455, 232] : p;
                return <text key={code} x={pos?.[0]} y={pos?.[1]} textAnchor="middle" className="pointer-events-none fill-foreground font-mono text-[13px] font-semibold" style={{ paintOrder: 'stroke', stroke: 'hsl(var(--background))', strokeWidth: 3 }}>{code}</text>;
              })}
            </svg>
            <div className="pointer-events-none absolute left-2 top-2 min-h-[3.5rem] rounded-md bg-background/90 px-2.5 py-1.5 text-xs shadow">
              {hv ? (
                <>
                  <div className="font-semibold">{hv.name}</div>
                  <div className="font-mono text-primary">{fmt(hv?.[mid], metric?.decimals ?? 0)} {metric?.unit}</div>
                  <div className="text-[10px] text-muted-foreground">Rank {rank(hv.code)} of {rows.length} · click for drill-down</div>
                </>
              ) : <span className="text-muted-foreground">Hover a state · click to drill down</span>}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
            <span>{fmt(min, metric?.decimals ?? 0)}</span>
            <span className="h-2 flex-1 rounded bg-gradient-to-r from-primary/10 to-primary" />
            <span>{fmt(max, metric?.decimals ?? 0)} {metric?.unit}</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Source: {metric?.source} · {metric?.live ? 'live feed' : 'Curated snapshot · rounded reference values, not auto-updating'}</p>
        </motion.section>

        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="min-w-0 rounded-md bg-card p-3 shadow">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <ArrowDownUp className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-semibold">State comparison</h2>
            <span className="text-[10px] text-muted-foreground">tick up to 4 states to compare</span>
            <label className="ml-auto flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2">
              <Search className="h-3 w-3 text-muted-foreground" />
              <input aria-label="Search states" value={q} onChange={(e) => setQ(e?.target?.value ?? '')} placeholder="Search…" className="w-28 bg-transparent text-xs outline-none placeholder:text-muted-foreground" />
            </label>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead className="sticky top-0 z-10 bg-card">
                <tr>
                  <th className="w-6 p-1" />
                  {[{ k: 'name', l: 'State' }, { k: mid, l: `${metric?.label ?? ''}${metric?.unit ? ` (${metric.unit})` : ''}` }, { k: 'population', l: 'Population (m)' }, { k: 'gdpPerCapita', l: 'GDP/capita' }, { k: 'temperature', l: 'Temp °C' }, { k: 'airIndex', l: 'Air idx' }, { k: 'roadworks', l: 'Roadworks' }].filter((c, i: number, a) => a.findIndex((x) => x.k === c.k) === i).map((c) => (
                    <th key={c.k} className="whitespace-nowrap p-1.5 text-left font-medium text-muted-foreground">
                      <button onClick={() => toggleSort(c.k)} className={cn('flex items-center gap-1 hover:text-foreground', sortKey === c.k && 'text-primary')}>{c.l}{sortKey === c.k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r: StateRow) => (
                  <tr key={r.code} onMouseEnter={() => setHover(r.code)} onMouseLeave={() => setHover(null)} className={cn('cursor-pointer transition-colors duration-300 hover:bg-accent', hover === r.code && 'bg-accent', filterState === r.code && 'bg-primary/10')}>
                    <td className="p-1"><input type="checkbox" aria-label={`Compare ${r.name}`} checked={compare.includes(r.code)} onChange={() => toggleCompare(r.code)} className="accent-primary" /></td>
                    <td className="whitespace-nowrap p-1.5 font-medium" onClick={() => setOpen(r.code)}><span className="mr-1.5 font-mono text-[10px] text-muted-foreground">{r.code}</span>{r.name}</td>
                    <td className="p-1.5" onClick={() => setOpen(r.code)}>
                      <div className="flex items-center gap-2">
                        <span className="w-16 text-right font-mono tabular-nums">{fmt(r?.[mid], metric?.decimals ?? 0)}</span>
                        <span className="h-1.5 w-20 rounded bg-muted"><span className="block h-full rounded bg-primary" style={{ width: `${Math.max(2, (alpha(num(r?.[mid])) - 0.14) / 0.86 * 100)}%` }} /></span>
                      </div>
                    </td>
                    {['population', 'gdpPerCapita', 'temperature', 'airIndex', 'roadworks'].filter((k: string) => k !== mid).map((k: string) => {
                      const m = metrics.find((x: Metric) => x.id === k);
                      return <td key={k} className="p-1.5 text-right font-mono tabular-nums text-muted-foreground" onClick={() => setOpen(r.code)}>{fmt(r?.[k], m?.decimals ?? 0)}</td>;
                    })}
                  </tr>
                ))}
                {!tableRows.length ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No state matches “{q}”.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </motion.section>
      </div>

      {cmpRows.length >= 2 ? (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-md bg-card p-3 shadow">
          <div className="mb-2 flex items-center gap-2"><GitCompare className="h-4 w-4 text-primary" /><h2 className="font-display text-sm font-semibold">Side-by-side: {cmpRows.map((r: StateRow) => r.name).join(' vs ')}</h2>
            <button onClick={() => setCompare([])} className="ml-auto rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent">Clear</button></div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead><tr><th className="p-1.5 text-left font-medium text-muted-foreground">Metric</th>{cmpRows.map((r: StateRow) => <th key={r.code} className="p-1.5 text-right font-semibold">{r.name}</th>)}</tr></thead>
              <tbody>
                {metrics.map((m: Metric) => {
                  const vals = cmpRows.map((r: StateRow) => num(r?.[m.id]));
                  const present = vals.filter((v: number | null): v is number => v !== null);
                  const best = m.higherIsBetter === null || m.higherIsBetter === undefined || !present.length ? null : m.higherIsBetter ? Math.max(...present) : Math.min(...present);
                  return (
                    <tr key={m.id} className="border-t border-border hover:bg-accent">
                      <td className="p-1.5 text-muted-foreground">{m.label}{m.unit ? ` (${m.unit})` : ''}</td>
                      {vals.map((v: number | null, i: number) => <td key={cmpRows[i]?.code ?? i} className={cn('p-1.5 text-right font-mono tabular-nums', best !== null && v === best && 'font-semibold text-ok')}>{fmt(v, m.decimals)}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.section>
      ) : null}

      <Dialog open={!!sel} onOpenChange={(o: boolean) => { if (!o) setOpen(null); }}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{sel?.name} <span className="font-mono text-xs text-muted-foreground">{sel?.code}</span></DialogTitle>
            <DialogDescription>
              Capital {String(sel?.capital ?? '—')} · {String(sel?.region ?? '')} · Head of government {String(sel?.head ?? '—')} ({String(sel?.headParty ?? '—')}) · Coalition {String(sel?.coalition ?? '—')} · Next election {String(sel?.nextElection ?? '—')}
            </DialogDescription>
          </DialogHeader>
          {groups.map((g: string) => (
            <div key={g}>
              <h3 className="mb-1 mt-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-primary">{g}</h3>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {metrics.filter((m: Metric) => m.group === g).map((m: Metric) => (
                  <button key={m.id} onClick={() => { setMetricId(m.id); setOpen(null); }} title={`Source: ${m.source} — click to map this metric`} className="rounded-md bg-muted p-2 text-left transition-colors duration-300 hover:bg-accent">
                    <div className="truncate text-[10px] text-muted-foreground">{m.label}{m.live ? ' · live' : ''}</div>
                    <div className="font-mono text-sm font-semibold tabular-nums">{fmt(sel?.[m.id], m.decimals)} <span className="text-[10px] font-normal text-muted-foreground">{m.unit}</span></div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">Non-live figures are a curated snapshot of rounded reference values and do not auto-update; government data may be out of date.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
