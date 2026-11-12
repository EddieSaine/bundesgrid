import type { Co2Frame, FeedResult, FlowFrame, GenerationKey, Horizon, PowerFrame, PriceFrame, TimeSeries } from '@/lib/domain/types';
import { fetchJson, loadFeed, UpstreamError } from '@/lib/feeds/core';
import { simulateCo2, simulateFlows, simulatePower, simulatePrice, simulateSmardLoad } from '@/lib/sim/energy';
import { bucketize, HORIZONS, utcDate } from '@/lib/time';

const EC = 'https://api.energy-charts.info';
const MIN = 60_000;
const TTL: Record<Horizon, number> = { '24h': 5 * MIN, '7d': 10 * MIN, '30d': 30 * MIN, '1y': 180 * MIN };
const TIMEOUT: Record<Horizon, number> = { '24h': 9_000, '7d': 10_000, '30d': 14_000, '1y': 25_000 };

type Num = number | null;
interface EcPower { unix_seconds?: number[]; production_types?: { name: string; data: Num[] }[] }
interface EcPrice { unix_seconds?: number[]; price?: Num[] }
interface EcCo2 { unix_seconds?: number[]; co2eq?: Num[]; co2eq_forecast?: Num[] }
interface EcFlows { unix_seconds?: number[]; countries?: { name: string; data: Num[] }[] }

const MAPPING: Record<GenerationKey, string[]> = {
  solar: ['Solar'],
  windOnshore: ['Wind onshore'],
  windOffshore: ['Wind offshore'],
  biomass: ['Biomass'],
  hydro: ['Hydro Run-of-River', 'Hydro water reservoir', 'Hydro pumped storage'],
  gas: ['Fossil gas', 'Fossil coal-derived gas'],
  hardCoal: ['Fossil hard coal'],
  lignite: ['Fossil brown coal / lignite'],
  other: ['Fossil oil', 'Geothermal', 'Others', 'Waste'],
};
export const GENERATION_KEYS = Object.keys(MAPPING) as GenerationKey[];

const emptyMw = (): Record<GenerationKey, number[]> => Object.fromEntries(GENERATION_KEYS.map((k) => [k, [] as number[]])) as Record<GenerationKey, number[]>;
const EMPTY_POWER: PowerFrame = { t: [], mw: emptyMw(), load: [], residual: [], crossBorder: [], bucketSec: 900 };

function range(h: Horizon, aheadDays = 0): { start: string; end: string; fromSec: number } {
  const now = Date.now();
  const fromMs = now - HORIZONS[h].days * 86_400_000;
  return { start: utcDate(fromMs - 86_400_000), end: utcDate(now + aheadDays * 86_400_000), fromSec: Math.floor(fromMs / 1000) };
}

export function getPower(h: Horizon): Promise<FeedResult<PowerFrame>> {
  const { days, bucketSec } = HORIZONS[h];
  return loadFeed<PowerFrame>('energy_power', {
    key: `energy_power:${h}`,
    ttlMs: TTL[h],
    empty: EMPTY_POWER,
    validate: (d) => d.t.length > 8,
    simulate: () => simulatePower(Date.now(), days, bucketSec),
    live: async () => {
      const r = range(h);
      const raw = await fetchJson<EcPower>(`${EC}/public_power?country=de&start=${r.start}&end=${r.end}`, { timeoutMs: TIMEOUT[h] });
      const t = raw?.unix_seconds ?? [];
      const types = new Map<string, Num[]>((raw?.production_types ?? []).map((p) => [p.name, p.data ?? []]));
      const load = types.get('Load') ?? [];
      const nowSec = Date.now() / 1000;
      let end = t.length - 1;
      while (end >= 0 && (typeof load[end] !== 'number' || (t[end] ?? 0) > nowSec)) end--;
      let start = 0;
      while (start < end && (t[start] ?? 0) < r.fromSec) start++;
      if (end - start < 8) throw new UpstreamError('no recent load data');
      const cut = <T,>(a: T[]): T[] => a.slice(start, end + 1);
      const sum = (names: string[]): Num[] =>
        cut(t).map((_, i) => {
          let s = 0;
          let seen = false;
          for (const n of names) {
            const v = types.get(n)?.[start + i];
            if (typeof v === 'number') {
              s += Math.max(0, v);
              seen = true;
            }
          }
          return seen ? s : null;
        });
      const cols: Record<string, Num[]> = {
        load: cut(load),
        residual: cut(types.get('Residual load') ?? []),
        crossBorder: cut(types.get('Cross border electricity trading') ?? []),
      };
      for (const k of GENERATION_KEYS) cols[k] = sum(MAPPING[k]);
      const b = bucketize(cut(t), cols, bucketSec);
      const mw = emptyMw();
      for (const k of GENERATION_KEYS) mw[k] = (b.cols[k] ?? []).map((v) => Math.round(v));
      return {
        t: b.t,
        mw,
        load: (b.cols.load ?? []).map((v) => Math.round(v)),
        residual: (b.cols.residual ?? []).map((v) => Math.round(v)),
        crossBorder: (b.cols.crossBorder ?? []).map((v) => Math.round(v)),
        bucketSec,
      };
    },
  });
}

export function getPrice(h: Horizon): Promise<FeedResult<PriceFrame>> {
  const { days, bucketSec } = HORIZONS[h];
  return loadFeed<PriceFrame>('energy_price', {
    key: `energy_price:${h}`,
    ttlMs: Math.max(TTL[h], 10 * MIN),
    empty: { history: { t: [], v: [] }, ahead: { t: [], v: [] }, bucketSec },
    validate: (d) => d.history.t.length > 8,
    simulate: () => simulatePrice(Date.now(), days, bucketSec),
    live: async () => {
      const r = range(h, 2);
      const raw = await fetchJson<EcPrice>(`${EC}/price?bzn=DE-LU&start=${r.start}&end=${r.end}`, { timeoutMs: TIMEOUT[h] });
      const t = raw?.unix_seconds ?? [];
      const p = raw?.price ?? [];
      const nowSec = Date.now() / 1000;
      const ht: number[] = [];
      const hv: Num[] = [];
      const at: number[] = [];
      const av: Num[] = [];
      for (let i = 0; i < t.length; i++) {
        const v = p[i];
        if (typeof v !== 'number') continue;
        if (t[i] <= nowSec) {
          if (t[i] >= r.fromSec) {
            ht.push(t[i]);
            hv.push(v);
          }
        } else {
          at.push(t[i]);
          av.push(v);
        }
      }
      const hb = bucketize(ht, { v: hv }, bucketSec);
      const ab = bucketize(at, { v: av }, 3600);
      const r2 = (a: number[]) => a.map((v) => Math.round(v * 100) / 100);
      return { history: { t: hb.t, v: r2(hb.cols.v) }, ahead: { t: ab.t, v: r2(ab.cols.v) }, bucketSec };
    },
  });
}

export function getCo2(): Promise<FeedResult<Co2Frame>> {
  return loadFeed<Co2Frame>('energy_co2', {
    empty: { actual: { t: [], v: [] }, forecast: { t: [], v: [] } },
    validate: (d) => d.actual.t.length > 4,
    simulate: () => simulateCo2(Date.now()),
    live: async () => {
      const raw = await fetchJson<EcCo2>(`${EC}/co2eq?country=de`);
      const t = raw?.unix_seconds ?? [];
      const actual: TimeSeries = { t: [], v: [] };
      const forecast: TimeSeries = { t: [], v: [] };
      t.forEach((s, i) => {
        const a = raw?.co2eq?.[i];
        const f = raw?.co2eq_forecast?.[i];
        if (typeof a === 'number') {
          actual.t.push(s);
          actual.v.push(Math.round(a));
        } else if (typeof f === 'number') {
          forecast.t.push(s);
          forecast.v.push(Math.round(f));
        }
      });
      return { actual, forecast };
    },
  });
}

export function getFlows(h: Horizon): Promise<FeedResult<FlowFrame>> {
  const { days, bucketSec } = HORIZONS[h];
  return loadFeed<FlowFrame>('energy_flows', {
    key: `energy_flows:${h}`,
    ttlMs: Math.max(TTL[h], 10 * MIN),
    empty: { t: [], countries: {}, bucketSec },
    validate: (d) => d.t.length > 4 && Object.keys(d.countries).length > 3,
    simulate: () => simulateFlows(Date.now(), days, bucketSec),
    live: async () => {
      const r = range(h);
      const raw = await fetchJson<EcFlows>(`${EC}/cbet?country=de&start=${r.start}&end=${r.end}`, { timeoutMs: TIMEOUT[h] });
      const t = raw?.unix_seconds ?? [];
      const list = (raw?.countries ?? []).filter((c) => c.name !== 'sum');
      const ref = raw?.countries?.find((c) => c.name === 'sum')?.data ?? list[0]?.data ?? [];
      let end = t.length - 1;
      while (end >= 0 && typeof ref[end] !== 'number') end--;
      let start = 0;
      while (start < end && (t[start] ?? 0) < r.fromSec) start++;
      const cols: Record<string, Num[]> = {};
      for (const c of list) cols[c.name] = (c.data ?? []).slice(start, end + 1);
      const b = bucketize(t.slice(start, end + 1), cols, bucketSec);
      const countries: Record<string, number[]> = {};
      for (const c of list) countries[c.name] = (b.cols[c.name] ?? []).map((v) => Math.round(v * 100) / 100);
      return { t: b.t, countries, bucketSec };
    },
  });
}

/** Hourly grid load published by the Bundesnetzagentur (SMARD filter 410), MW. Independent cross-check. */
export function getSmardLoad(): Promise<FeedResult<TimeSeries>> {
  return loadFeed<TimeSeries>('smard_load', {
    empty: { t: [], v: [] },
    validate: (d) => d.t.length > 6,
    simulate: () => simulateSmardLoad(Date.now()),
    live: async () => {
      const base = 'https://www.smard.de/app/chart_data/410/DE';
      const idx = await fetchJson<{ timestamps?: number[] }>(`${base}/index_hour.json`);
      const stamps = (idx?.timestamps ?? []).slice(-2);
      const out: TimeSeries = { t: [], v: [] };
      for (const ts of stamps) {
        const chunk = await fetchJson<{ series?: [number, number | null][] }>(`${base}/410_DE_hour_${ts}.json`);
        for (const row of chunk?.series ?? []) {
          if (typeof row?.[1] === 'number') {
            out.t.push(Math.floor(row[0] / 1000));
            out.v.push(Math.round(row[1]));
          }
        }
      }
      return { t: out.t.slice(-72), v: out.v.slice(-72) };
    },
  });
}
