/**
 * Real-time simulation of the German power system. Deterministic in time: the same instant always yields the
 * same value, so charts are stable across requests while still moving minute by minute.
 */
import type { Co2Frame, FlowFrame, GenerationKey, PowerFrame, PriceFrame, TimeSeries } from '@/lib/domain/types';
import { NEIGHBOURS } from '@/lib/data/national';
import { clamp, fbm, strSeed } from '@/lib/sim/noise';
import { berlinHour, berlinParts, dayOfYear } from '@/lib/time';

const S = (k: string) => strSeed(`energy:${k}`);
const HOUR = 3600;

export interface PowerPoint {
  mw: Record<GenerationKey, number>;
  load: number;
  residual: number;
  crossBorder: number;
  price: number;
  co2: number;
}

/** Instantaneous system state at `sec` (epoch seconds). */
export function powerAt(sec: number): PowerPoint {
  const ms = sec * 1000;
  const doy = dayOfYear(ms);
  const h = berlinHour(ms);
  const season = Math.cos(((doy - 172) / 365) * 2 * Math.PI); // +1 midsummer, −1 midwinter
  const p = berlinParts(ms);
  const weekend = p.weekday === 'Sat' || p.weekday === 'Sun';

  // Solar: day length and peak yield follow the season, cloud cover follows slow noise.
  const dayLen = 12.2 + 4.3 * season;
  const rise = 12.6 - dayLen / 2;
  const sun = h > rise && h < rise + dayLen ? Math.sin((Math.PI * (h - rise)) / dayLen) ** 1.4 : 0;
  const cloud = clamp(0.62 + 0.38 * fbm(S('cloud'), sec / (HOUR * 9)), 0.18, 1);
  const solar = 99_000 * sun * (0.36 + 0.22 * season) * cloud;

  // Wind: multi-day weather systems, windier in winter.
  const cfOn = clamp(0.25 - 0.07 * season + 0.24 * fbm(S('windOn'), sec / (HOUR * 30)) + 0.05 * fbm(S('gust'), sec / (HOUR * 3)), 0.02, 0.82);
  const cfOff = clamp(0.42 - 0.08 * season + 0.34 * fbm(S('windOff'), sec / (HOUR * 34)), 0.03, 0.95);
  const windOnshore = 63_500 * cfOn;
  const windOffshore = 9_200 * cfOff;

  const biomass = 4_650 + 250 * fbm(S('bio'), sec / (HOUR * 12));
  const hydro = 1_900 + 500 * season + 250 * fbm(S('hydro'), sec / (HOUR * 60));

  // Load: morning and evening shoulders, weekend dip, winter heating.
  const daily = 0.8 + 0.15 * Math.exp(-((h - 11.5) ** 2) / 18) + 0.11 * Math.exp(-((h - 18.5) ** 2) / 5) - 0.06 * Math.exp(-((h - 3.5) ** 2) / 8);
  const load = (58_000 - 5_500 * season) * daily * (weekend ? 0.88 : 1) * (1 + 0.02 * fbm(S('load'), sec / (HOUR * 5)));

  const residual = load - solar - windOnshore - windOffshore;
  const need = Math.max(0, residual - biomass - hydro);
  const lignite = clamp(need * 0.34, 2_800, 13_500);
  const hardCoal = clamp(need * 0.16, 900, 7_500);
  const gas = clamp(need * 0.3 + 1_200 * fbm(S('gas'), sec / (HOUR * 4)), 2_600, 17_000);
  const other = 2_400 + 300 * fbm(S('other'), sec / (HOUR * 20));

  const mw: Record<GenerationKey, number> = { solar, windOnshore, windOffshore, biomass, hydro, gas, hardCoal, lignite, other };
  const total = Object.values(mw).reduce((a, b) => a + b, 0);
  const crossBorder = load - total;
  const residualGw = residual / 1000;
  const price = clamp(18 + 2.35 * residualGw + 0.035 * Math.max(0, residualGw - 45) ** 2 + 9 * fbm(S('price'), sec / (HOUR * 6)), -45, 420);
  const co2 = (lignite * 1_080 + hardCoal * 860 + gas * 410 + other * 520 + biomass * 60) / Math.max(1, total);
  return { mw, load, residual, crossBorder, price, co2 };
}

/** Mean of `fn` over a bucket; coarse buckets are sub-sampled so daily shapes do not alias. */
function bucketMean(sec: number, bucketSec: number, fn: (s: number) => number): number {
  const n = bucketSec >= 604_800 ? 28 : bucketSec >= 21_600 ? 6 : 1;
  if (n === 1) return fn(sec);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += fn(sec + (i * bucketSec) / n);
  return sum / n;
}

function grid(nowMs: number, days: number, bucketSec: number, aheadSec = 0): number[] {
  const end = Math.floor(nowMs / 1000 / bucketSec) * bucketSec + aheadSec;
  const start = Math.floor((nowMs / 1000 - days * 86_400) / bucketSec) * bucketSec;
  const out: number[] = [];
  for (let s = start; s <= end; s += bucketSec) out.push(s);
  return out;
}

const KEYS: GenerationKey[] = ['solar', 'windOnshore', 'windOffshore', 'biomass', 'hydro', 'gas', 'hardCoal', 'lignite', 'other'];

export function simulatePower(nowMs: number, days: number, bucketSec: number): PowerFrame {
  const t = grid(nowMs, days, bucketSec);
  const mw = Object.fromEntries(KEYS.map((k) => [k, [] as number[]])) as Record<GenerationKey, number[]>;
  const load: number[] = [];
  const residual: number[] = [];
  const crossBorder: number[] = [];
  for (const s of t) {
    for (const k of KEYS) mw[k].push(Math.round(bucketMean(s, bucketSec, (x) => powerAt(x).mw[k])));
    load.push(Math.round(bucketMean(s, bucketSec, (x) => powerAt(x).load)));
    residual.push(Math.round(bucketMean(s, bucketSec, (x) => powerAt(x).residual)));
    crossBorder.push(Math.round(bucketMean(s, bucketSec, (x) => powerAt(x).crossBorder)));
  }
  return { t, mw, load, residual, crossBorder, bucketSec };
}

export function simulatePrice(nowMs: number, days: number, bucketSec: number): PriceFrame {
  const t = grid(nowMs, days, bucketSec);
  const history: TimeSeries = { t, v: t.map((s) => Math.round(bucketMean(s, bucketSec, (x) => powerAt(x).price) * 100) / 100) };
  const aheadT: number[] = [];
  const nowSec = Math.floor(nowMs / 1000 / HOUR) * HOUR;
  for (let s = nowSec + HOUR; s <= nowSec + 18 * HOUR; s += HOUR) aheadT.push(s);
  return { history, ahead: { t: aheadT, v: aheadT.map((s) => Math.round(powerAt(s).price * 100) / 100) }, bucketSec };
}

export function simulateCo2(nowMs: number): Co2Frame {
  const t = grid(nowMs, 2, 900);
  const nowSec = Math.floor(nowMs / 1000 / 900) * 900;
  const ft: number[] = [];
  for (let s = nowSec + 900; s <= nowSec + 12 * HOUR; s += 900) ft.push(s);
  return {
    actual: { t, v: t.map((s) => Math.round(powerAt(s).co2)) },
    forecast: { t: ft, v: ft.map((s) => Math.round(powerAt(s).co2)) },
  };
}

const FLOW_WEIGHT: Record<string, number> = {
  Austria: 0.14, Belgium: 0.05, 'Czech Republic': 0.09, Denmark: 0.13, France: 0.16, Luxembourg: 0.04,
  Netherlands: 0.13, Norway: 0.07, Poland: 0.05, Sweden: 0.04, Switzerland: 0.1,
};
// Structural bias in GW: hydro/nuclear neighbours tend to export to Germany, AT/LU/PL tend to import.
const FLOW_BIAS: Record<string, number> = {
  Austria: -1.1, Belgium: 0.2, 'Czech Republic': -0.4, Denmark: 0.9, France: 1.2, Luxembourg: -0.5,
  Netherlands: 0.3, Norway: 0.6, Poland: -0.5, Sweden: 0.4, Switzerland: 0.2,
};

export function flowAt(sec: number, country: string): number {
  const net = powerAt(sec).crossBorder / 1000;
  const w = FLOW_WEIGHT[country] ?? 0.05;
  return net * w + (FLOW_BIAS[country] ?? 0) + 0.45 * fbm(S(`flow:${country}`), sec / (HOUR * 7));
}

export function simulateFlows(nowMs: number, days: number, bucketSec: number): FlowFrame {
  const t = grid(nowMs, days, bucketSec);
  const countries: Record<string, number[]> = {};
  for (const c of NEIGHBOURS) countries[c] = t.map((s) => Math.round(bucketMean(s, bucketSec, (x) => flowAt(x, c)) * 100) / 100);
  return { t, countries, bucketSec };
}

/** Hourly grid load in MW for the SMARD cross-check feed. */
export function simulateSmardLoad(nowMs: number): TimeSeries {
  const t = grid(nowMs, 3, HOUR);
  return { t, v: t.map((s) => Math.round(powerAt(s).load * (1 + 0.008 * fbm(S('smard'), s / HOUR)))) };
}
