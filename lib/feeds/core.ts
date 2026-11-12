/**
 * Feed runtime: one code path for every data source.
 *
 *   fresh cache hit ──► serve cached (keeps its status)
 *   live fetch OK ────► LIVE      (cached, snapshot persisted)
 *   live fetch fails ─► STALE     (last good payload from memory / Postgres, if young enough)
 *                    └► SIMULATED (deterministic real-time simulation of the same shape)
 *   simulation fails ─► ERROR     (empty payload supplied by the caller)
 */
import type { FeedDefinition, FeedId, FeedResult, FeedState, FeedStatus } from '@/lib/domain/types';
import { checkStats24h, readSnapshot, recordCheck, saveSnapshot } from '@/lib/feeds/store';

const MIN = 60_000;
const HOUR = 60 * MIN;

const def = (
  id: FeedId,
  name: string,
  provider: string,
  homepage: string,
  kind: 'live' | 'simulated',
  ttlMs: number,
  staleMs: number,
  cadence: string,
  section: string,
): FeedDefinition => ({ id, name, provider, homepage, kind, ttlMs, staleMs, cadence, section });

export const FEEDS: Record<FeedId, FeedDefinition> = {
  energy_power: def('energy_power', 'Generation & load', 'Energy-Charts · Fraunhofer ISE', 'https://api.energy-charts.info', 'live', 5 * MIN, 3 * HOUR, '15 min', 'energy'),
  energy_price: def('energy_price', 'Day-ahead price DE-LU', 'Energy-Charts · Bundesnetzagentur/SMARD', 'https://api.energy-charts.info', 'live', 10 * MIN, 12 * HOUR, '15 min / daily auction', 'energy'),
  energy_co2: def('energy_co2', 'Grid CO₂ intensity', 'Energy-Charts · Fraunhofer ISE', 'https://api.energy-charts.info', 'live', 10 * MIN, 3 * HOUR, '15 min', 'energy'),
  energy_flows: def('energy_flows', 'Cross-border physical flows', 'Energy-Charts · ENTSO-E', 'https://api.energy-charts.info', 'live', 10 * MIN, 6 * HOUR, '15 min', 'energy'),
  smard_load: def('smard_load', 'Grid load (cross-check)', 'SMARD · Bundesnetzagentur', 'https://www.smard.de', 'live', 15 * MIN, 6 * HOUR, 'hourly', 'energy'),
  weather_current: def('weather_current', 'Current weather, 16 capitals', 'Bright Sky · DWD open data', 'https://brightsky.dev', 'live', 10 * MIN, 2 * HOUR, '10–30 min', 'weather'),
  weather_history: def('weather_history', 'Hourly weather history', 'Bright Sky · DWD open data', 'https://brightsky.dev', 'live', 30 * MIN, 6 * HOUR, 'hourly', 'weather'),
  weather_alerts: def('weather_alerts', 'Official weather warnings', 'Bright Sky · DWD warnings', 'https://brightsky.dev', 'live', 5 * MIN, 1 * HOUR, 'event-driven', 'weather'),
  civil_warnings: def('civil_warnings', 'Civil protection warnings', 'NINA · BBK (warnung.bund.de)', 'https://nina.api.bund.dev', 'live', 5 * MIN, 1 * HOUR, 'event-driven', 'weather'),
  autobahn: def('autobahn', 'Autobahn roadworks, closures, warnings', 'Autobahn GmbH (bund.dev)', 'https://autobahn.api.bund.dev', 'live', 10 * MIN, 3 * HOUR, 'event-driven', 'mobility'),
  water_levels: def('water_levels', 'Water levels at key gauges', 'PEGELONLINE · WSV', 'https://www.pegelonline.wsv.de', 'live', 10 * MIN, 3 * HOUR, '15 min', 'rivers'),
  water_history: def('water_history', 'Gauge level history', 'PEGELONLINE · WSV', 'https://www.pegelonline.wsv.de', 'live', 20 * MIN, 6 * HOUR, '15 min', 'rivers'),
  air_quality: def('air_quality', 'Air quality index per station', 'Umweltbundesamt', 'https://www.umweltbundesamt.de/daten/luft/luftdaten', 'live', 15 * MIN, 4 * HOUR, 'hourly', 'air'),
  air_history: def('air_history', 'Air quality, national 24 h', 'Umweltbundesamt', 'https://www.umweltbundesamt.de/daten/luft/luftdaten', 'live', 30 * MIN, 6 * HOUR, 'hourly', 'air'),
  fx_rates: def('fx_rates', 'EUR reference rates', 'Frankfurter · ECB', 'https://frankfurter.dev', 'live', 30 * MIN, 72 * HOUR, 'daily (16:00 CET)', 'economy'),
  equity_indices: def('equity_indices', 'DAX family & Euro Stoxx 50', 'Yahoo Finance chart API (unofficial)', 'https://finance.yahoo.com', 'live', 2 * MIN, 30 * MIN, 'delayed ≈15 min', 'economy'),
  inflation: def('inflation', 'HICP inflation, Germany', 'ECB Data Portal', 'https://data.ecb.europa.eu', 'live', 6 * HOUR, 45 * 24 * HOUR, 'monthly', 'economy'),
  unemployment: def('unemployment', 'Unemployment rate (ILO, s.a.)', 'Eurostat', 'https://ec.europa.eu/eurostat', 'live', 6 * HOUR, 45 * 24 * HOUR, 'monthly', 'economy'),
  gdp: def('gdp', 'Real GDP, q/q', 'Eurostat', 'https://ec.europa.eu/eurostat', 'live', 6 * HOUR, 120 * 24 * HOUR, 'quarterly', 'economy'),
  ifo_index: def('ifo_index', 'ifo Business Climate (modelled)', 'Simulation · no open API', 'https://www.ifo.de', 'simulated', 30 * MIN, 0, 'monthly', 'economy'),
  insolvencies: def('insolvencies', 'Corporate insolvencies (modelled)', 'Simulation · no open API', 'https://www.destatis.de', 'simulated', 30 * MIN, 0, 'monthly', 'economy'),
  rail: def('rail', 'Rail punctuality (modelled)', 'Simulation · no open API', 'https://www.deutschebahn.com', 'simulated', 5_000, 0, '5 s', 'mobility'),
};

interface CacheEntry {
  data: unknown;
  status: FeedState;
  fetchedAt: number;
  expires: number;
  latencyMs: number;
  error?: string;
}

interface HealthEntry {
  status: FeedState;
  updatedAt: number | null;
  lastAttemptAt: number | null;
  latencyMs: number | null;
  error: string | null;
  consecutiveFailures: number;
  recent: number[];
}

interface Runtime {
  cache: Map<string, CacheEntry>;
  lastGood: Map<string, { data: unknown; fetchedAt: number }>;
  inflight: Map<string, Promise<CacheEntry>>;
  health: Map<FeedId, HealthEntry>;
}

const globalRef = globalThis as unknown as { __ddRuntime?: Runtime };
const rt: Runtime =
  globalRef.__ddRuntime ??
  (globalRef.__ddRuntime = { cache: new Map(), lastGood: new Map(), inflight: new Map(), health: new Map() });

/** `DD_FORCE_SIM=all` or a comma-separated list of feed ids forces the simulator (used to test fallbacks). */
function forcedSim(feedId: FeedId): boolean {
  const raw = (process.env.DD_FORCE_SIM ?? '').trim();
  if (!raw) return false;
  if (raw === 'all' || raw === '1' || raw === 'true') return true;
  return raw.split(',').map((s: string) => s.trim()).includes(feedId);
}

export class UpstreamError extends Error {}

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/** GET JSON with a hard timeout; any non-2xx or unparsable body throws. */
export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 9_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      redirect: 'follow',
      headers: { Accept: 'application/json', ...(opts.headers ?? {}) },
    });
    if (!res.ok) throw new UpstreamError(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new UpstreamError(`timeout after ${opts.timeoutMs ?? 9_000} ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Run async jobs with bounded concurrency; failures resolve to null. */
export async function mapLimit<I, O>(items: I[], limit: number, fn: (item: I) => Promise<O>): Promise<(O | null)[]> {
  const out: (O | null)[] = new Array(items.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch {
        out[i] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function note(feedId: FeedId, entry: CacheEntry, attempted: boolean, ok: boolean) {
  const h: HealthEntry =
    rt.health.get(feedId) ??
    { status: entry.status, updatedAt: null, lastAttemptAt: null, latencyMs: null, error: null, consecutiveFailures: 0, recent: [] };
  h.status = entry.status;
  h.updatedAt = entry.fetchedAt;
  if (attempted) {
    h.lastAttemptAt = Date.now();
    h.latencyMs = entry.latencyMs;
    h.error = ok ? null : entry.error ?? 'upstream failed';
    h.consecutiveFailures = ok ? 0 : h.consecutiveFailures + 1;
    h.recent = [...h.recent, ok ? Math.round(entry.latencyMs) : -1].slice(-30);
  }
  rt.health.set(feedId, h);
}

function background(job: () => Promise<void>) {
  // Persistence must never delay or break a response.
  job().catch(() => undefined);
}

export interface LoadOptions<T> {
  /** Cache key; defaults to the feed id. Use it to separate horizons. */
  key?: string;
  ttlMs?: number;
  /** Real upstream fetch. Omit for feeds that are simulated by design. */
  live?: () => Promise<T>;
  simulate: () => T;
  /** Returned when even the simulator throws. */
  empty: T;
  /** Reject a structurally valid but useless live payload (e.g. no rows). */
  validate?: (data: T) => boolean;
}

export async function loadFeed<T>(feedId: FeedId, opts: LoadOptions<T>): Promise<FeedResult<T>> {
  const d = FEEDS[feedId];
  const key = opts.key ?? feedId;
  const now = Date.now();
  const hit = rt.cache.get(key);
  if (hit && hit.expires > now) return toResult<T>(feedId, hit);

  let pending = rt.inflight.get(key);
  if (!pending) {
    pending = resolve<T>(d, key, opts).finally(() => rt.inflight.delete(key));
    rt.inflight.set(key, pending);
  }
  return toResult<T>(feedId, await pending);
}

function toResult<T>(feedId: FeedId, e: CacheEntry): FeedResult<T> {
  return {
    feedId,
    data: e.data as T,
    status: e.status,
    updatedAt: new Date(e.fetchedAt).toISOString(),
    latencyMs: e.latencyMs,
    error: e.error,
  };
}

async function resolve<T>(d: FeedDefinition, key: string, opts: LoadOptions<T>): Promise<CacheEntry> {
  const ttl = opts.ttlMs ?? d.ttlMs;
  const started = Date.now();
  const useLive = Boolean(opts.live) && d.kind === 'live' && !forcedSim(d.id);
  let failure: string | undefined;

  if (useLive && opts.live) {
    try {
      const data = await opts.live();
      if (opts.validate && !opts.validate(data)) throw new UpstreamError('empty or malformed payload');
      const entry: CacheEntry = { data, status: 'LIVE', fetchedAt: Date.now(), expires: Date.now() + ttl, latencyMs: Date.now() - started };
      rt.cache.set(key, entry);
      rt.lastGood.set(key, { data, fetchedAt: entry.fetchedAt });
      note(d.id, entry, true, true);
      background(async () => {
        await saveSnapshot(key, d.id, data, entry.fetchedAt);
        await recordCheck(d.id, 'LIVE', entry.latencyMs);
      });
      return entry;
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }

    // Upstream failed: prefer the last good payload while it is still young enough.
    const latency = Date.now() - started;
    const remembered = rt.lastGood.get(key) ?? (await readSnapshot<T>(key));
    if (remembered && Date.now() - remembered.fetchedAt < d.staleMs) {
      const entry: CacheEntry = {
        data: remembered.data,
        status: 'STALE',
        fetchedAt: remembered.fetchedAt,
        expires: Date.now() + Math.min(ttl, MIN),
        latencyMs: latency,
        error: failure,
      };
      rt.cache.set(key, entry);
      note(d.id, entry, true, false);
      background(() => recordCheck(d.id, 'STALE', latency, failure));
      return entry;
    }
  } else if (d.kind === 'live') {
    failure = 'simulation forced via DD_FORCE_SIM';
  }

  try {
    const data = opts.simulate();
    const entry: CacheEntry = {
      data,
      status: 'SIMULATED',
      fetchedAt: Date.now(),
      // Retry a failed live source after a minute; by-design simulations follow their own cadence.
      expires: Date.now() + (d.kind === 'live' ? Math.min(ttl, MIN) : ttl),
      latencyMs: Date.now() - started,
      error: failure,
    };
    rt.cache.set(key, entry);
    note(d.id, entry, useLive, false);
    if (useLive) background(() => recordCheck(d.id, 'SIMULATED', entry.latencyMs, failure));
    return entry;
  } catch (e) {
    const entry: CacheEntry = {
      data: opts.empty,
      status: 'ERROR',
      fetchedAt: Date.now(),
      expires: Date.now() + 30_000,
      latencyMs: Date.now() - started,
      error: `${failure ? failure + '; ' : ''}simulation failed: ${e instanceof Error ? e.message : String(e)}`,
    };
    rt.cache.set(key, entry);
    note(d.id, entry, true, false);
    background(() => recordCheck(d.id, 'ERROR', entry.latencyMs, entry.error));
    return entry;
  }
}

/** Status of one feed as last observed by this server instance. */
export function feedStatus(feedId: FeedId, stats?: Record<string, { total: number; ok: number }>): FeedStatus {
  const d = FEEDS[feedId];
  const h = rt.health.get(feedId);
  const st = stats?.[feedId];
  let status: FeedState = h?.status ?? (d.kind === 'simulated' ? 'SIMULATED' : 'STALE');
  // A cached LIVE payload that has outlived three refresh cycles without a new attempt is reported as STALE.
  if (h && status === 'LIVE' && h.updatedAt && Date.now() - h.updatedAt > Math.max(3 * d.ttlMs, 15 * MIN)) status = 'STALE';
  return {
    feedId,
    name: d.name,
    provider: d.provider,
    homepage: d.homepage,
    kind: d.kind,
    section: d.section,
    cadence: d.cadence,
    status,
    updatedAt: h?.updatedAt ? new Date(h.updatedAt).toISOString() : null,
    lastAttemptAt: h?.lastAttemptAt ? new Date(h.lastAttemptAt).toISOString() : null,
    latencyMs: h?.latencyMs ?? null,
    error: h?.error ?? null,
    consecutiveFailures: h?.consecutiveFailures ?? 0,
    recent: h?.recent ?? [],
    uptime24h: st && st.total > 0 ? st.ok / st.total : null,
    checks24h: st?.total ?? 0,
  };
}

export async function allFeedStatuses(): Promise<FeedStatus[]> {
  const stats = await checkStats24h();
  return (Object.keys(FEEDS) as FeedId[]).map((id) => feedStatus(id, stats));
}

export function statusOf(results: FeedResult<unknown>[]): FeedStatus[] {
  const seen = new Set<FeedId>();
  const out: FeedStatus[] = [];
  for (const r of results) {
    if (seen.has(r.feedId)) continue;
    seen.add(r.feedId);
    const s = feedStatus(r.feedId);
    out.push({ ...s, status: r.status, updatedAt: r.updatedAt });
  }
  return out;
}

/** Oldest `updatedAt` across results — the honest "data as of" for a composed view. */
export function oldestUpdate(results: FeedResult<unknown>[]): string {
  let min = Date.now();
  for (const r of results) {
    const t = Date.parse(r.updatedAt);
    if (!Number.isNaN(t) && t < min) min = t;
  }
  return new Date(min).toISOString();
}
