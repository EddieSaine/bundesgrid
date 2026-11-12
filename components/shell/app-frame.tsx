'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, CloudSun, Gauge, Landmark, Map as MapIcon, Menu, Route, Search, TrendingUp, Users, Waves, Wind, X, Zap, Clock, Timer, Filter,
  type LucideIcon,
} from 'lucide-react';
import { NAV, navFor, type NavItem } from '@/lib/nav';
import { HORIZON_ORDER, HORIZONS } from '@/lib/time';
import { STATES } from '@/lib/data/states';
import type { Horizon } from '@/lib/domain/types';
import { useSettings } from '@/hooks/use-settings';
import { useLiveStream } from '@/hooks/use-live-stream';
import { useMounted } from '@/components/client-only';
import { TickerBar } from '@/components/shell/ticker-bar';
import { CommandPalette } from '@/components/shell/command-palette';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  gauge: Gauge, map: MapIcon, zap: Zap, cloud: CloudSun, route: Route, waves: Waves, wind: Wind, trending: TrendingUp, users: Users, landmark: Landmark, activity: Activity,
};

const REFRESH: { ms: number; label: string }[] = [
  { ms: 15000, label: '15 s' }, { ms: 30000, label: '30 s' }, { ms: 60000, label: '60 s' }, { ms: 300000, label: '5 min' }, { ms: 0, label: 'Paused' },
];

function BerlinClock() {
  const mounted = useMounted();
  const [now, setNow] = useState<number>(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = mounted && now ? new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now) : '--:--:--';
  const date = mounted && now ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: 'short' }).format(now) : '';
  return (
    <div className="flex items-center gap-1.5 font-mono text-xs" title="Europe/Berlin">
      <Clock className="h-3.5 w-3.5 text-primary" />
      <span className="font-semibold tabular-nums text-foreground">{time}</span>
      <span className="hidden text-muted-foreground lg:inline">{date} · Berlin</span>
    </div>
  );
}

function NavList({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  const active = navFor(path);
  return (
    <nav className="flex flex-col gap-0.5 p-2" aria-label="Sections">
      {(NAV ?? []).map((n: NavItem) => {
        const Icon = ICONS?.[n.icon] ?? Gauge;
        const on = active?.id === n.id;
        return (
          <Link
            key={n.id}
            href={n.href}
            onClick={() => onNavigate?.()}
            className={cn(
              'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors duration-300',
              on ? 'bg-primary/15 text-primary shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate font-medium">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

const selectCls = 'h-7 rounded-md border border-border bg-background px-1.5 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring';

export function AppFrame({ children }: { children: ReactNode }) {
  const path = usePathname() ?? '/';
  const nav = navFor(path);
  const [drawer, setDrawer] = useState(false);
  const { horizon, setHorizon, refreshMs, setRefreshMs, state, setState, setPaletteOpen } = useSettings();
  const { payload, mode } = useLiveStream();
  const feeds = payload?.feeds ?? [];
  const live = feeds.filter((f) => f?.status === 'LIVE').length;
  const bad = feeds.filter((f) => f?.status === 'ERROR' || f?.status === 'STALE').length;
  const supported: Horizon[] = (nav?.horizons ?? []) as Horizon[];

  const brand = (
    <Link href="/" className="flex h-12 items-center gap-2 border-b border-border px-3">
      <span className="flex h-6 w-6 flex-col overflow-hidden rounded-sm shadow" aria-hidden>
        <span className="flex-1 bg-foreground/90" /><span className="flex-1 bg-destructive" /><span className="flex-1 bg-warn" />
      </span>
      <span className="font-display text-sm font-bold tracking-tight text-foreground">Deutschland<span className="text-primary">·</span>Dashboard</span>
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-52 flex-col border-r border-border bg-sidebar lg:flex">
        {brand}
        <div className="flex-1 overflow-y-auto"><NavList path={path} /></div>
        <Link href="/system" className="m-2 rounded-md bg-card p-2 font-mono text-[10px] text-muted-foreground shadow-sm hover:bg-accent">
          <div className="mb-1 font-semibold tracking-widest text-foreground">NETWORK HEALTH</div>
          <div><span className="text-ok">{live}</span> live · <span className="text-sim">{feeds.filter((f) => f?.status === 'SIMULATED').length}</span> sim · <span className={bad ? 'text-destructive' : ''}>{bad}</span> degraded</div>
        </Link>
      </aside>

      <AnimatePresence>
        {drawer ? (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button aria-label="Close menu" className="absolute inset-0 bg-background/80" onClick={() => setDrawer(false)} />
            <motion.aside initial={{ x: -240 }} animate={{ x: 0 }} exit={{ x: -240 }} transition={{ duration: 0.25 }} className="relative h-full w-60 border-r border-border bg-sidebar shadow-xl">
              {brand}
              <button aria-label="Close menu" className="absolute right-2 top-3 text-muted-foreground" onClick={() => setDrawer(false)}><X className="h-5 w-5" /></button>
              <NavList path={path} onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-52">
        <header className="sticky top-0 z-20 bg-background/85 backdrop-blur">
          <div className="flex h-12 items-center gap-2 border-b border-border px-2 sm:px-3">
            <button aria-label="Open menu" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent lg:hidden" onClick={() => setDrawer(true)}><Menu className="h-5 w-5" /></button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-sm font-semibold">{nav?.label}</h1>
              <p className="hidden truncate text-[11px] text-muted-foreground md:block">{nav?.blurb}</p>
            </div>
            <div className="hidden items-center rounded-md border border-border bg-card p-0.5 sm:flex" role="group" aria-label="Time horizon">
              {HORIZON_ORDER.map((h: Horizon) => {
                const ok = supported.includes(h);
                return (
                  <button
                    key={h}
                    disabled={!ok}
                    onClick={() => setHorizon(h)}
                    title={ok ? HORIZONS?.[h]?.long : 'Not applicable on this tab'}
                    className={cn('rounded px-2 py-1 font-mono text-[11px] font-semibold uppercase transition-colors duration-300', horizon === h && ok ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground', !ok && 'cursor-not-allowed opacity-30')}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
            <label className="hidden items-center gap-1 md:flex" title="Cross-filter by Bundesland">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <select aria-label="State filter" className={selectCls} value={state} onChange={(e) => setState(e?.target?.value ?? '')}>
                <option value="">All states</option>
                {(STATES ?? []).map((s: { code: string; name: string }) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </label>
            <label className="hidden items-center gap-1 md:flex" title="Refresh interval">
              <Timer className="h-3.5 w-3.5 text-muted-foreground" />
              <select aria-label="Refresh interval" className={selectCls} value={refreshMs} onChange={(e) => setRefreshMs(Number(e?.target?.value ?? 60000))}>
                {REFRESH.map((r) => <option key={r.ms} value={r.ms}>{r.label}</option>)}
              </select>
            </label>
            <button onClick={() => setPaletteOpen(true)} className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[11px] text-muted-foreground transition-colors duration-300 hover:bg-accent hover:text-foreground" aria-label="Open search">
              <Search className="h-3.5 w-3.5" /><span className="hidden sm:inline">Search</span><kbd className="hidden rounded bg-muted px-1 font-mono text-[10px] sm:inline">⌘K</kbd>
            </button>
            <BerlinClock />
          </div>
          <div className="flex items-center gap-2 border-b border-border px-2 py-1 sm:hidden">
            <select aria-label="Time horizon" className={selectCls} value={horizon} onChange={(e) => setHorizon((e?.target?.value ?? '24h') as Horizon)}>
              {HORIZON_ORDER.map((h: Horizon) => <option key={h} value={h} disabled={!supported.includes(h)}>{h.toUpperCase()}</option>)}
            </select>
            <select aria-label="State filter" className={cn(selectCls, 'min-w-0 flex-1')} value={state} onChange={(e) => setState(e?.target?.value ?? '')}>
              <option value="">All states</option>
              {(STATES ?? []).map((s: { code: string; name: string }) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
            <select aria-label="Refresh interval" className={selectCls} value={refreshMs} onChange={(e) => setRefreshMs(Number(e?.target?.value ?? 60000))}>
              {REFRESH.map((r) => <option key={r.ms} value={r.ms}>{r.label}</option>)}
            </select>
          </div>
          <TickerBar payload={payload} mode={mode} />
        </header>
        <motion.main key={path} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="min-w-0 flex-1">
          {children}
        </motion.main>
      </div>
      <CommandPalette />
    </div>
  );
}
