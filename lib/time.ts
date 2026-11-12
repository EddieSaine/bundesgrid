import type { Horizon } from '@/lib/domain/types';

export const BERLIN_TZ = 'Europe/Berlin';

export const HORIZONS: Record<Horizon, { label: string; long: string; days: number; bucketSec: number }> = {
  '24h': { label: '24H', long: 'last 24 hours', days: 1, bucketSec: 900 },
  '7d': { label: '7D', long: 'last 7 days', days: 7, bucketSec: 3600 },
  '30d': { label: '30D', long: 'last 30 days', days: 30, bucketSec: 21600 },
  '1y': { label: '1Y', long: 'last 12 months', days: 365, bucketSec: 604800 },
};

export const HORIZON_ORDER: Horizon[] = ['24h', '7d', '30d', '1y'];

export function parseHorizon(v: string | null | undefined): Horizon {
  return v === '7d' || v === '30d' || v === '1y' ? v : '24h';
}

/** Largest supported horizon that does not exceed the requested one. */
export function clampHorizon(h: Horizon, supported: Horizon[]): Horizon {
  const want = HORIZON_ORDER.indexOf(h);
  let best = supported[0] ?? '24h';
  for (const s of supported) if (HORIZON_ORDER.indexOf(s) <= want) best = s;
  return best;
}

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: BERLIN_TZ,
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const numFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: BERLIN_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface BerlinParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  monthName: string;
  weekday: string;
}

export function berlinParts(ms: number): BerlinParts {
  const d = new Date(ms);
  const a: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(d)) a[p.type] = p.value;
  const n: Record<string, string> = {};
  for (const p of numFmt.formatToParts(d)) n[p.type] = p.value;
  return {
    year: Number(n.year),
    month: Number(n.month),
    day: Number(n.day),
    hour: Number(n.hour) % 24,
    minute: Number(n.minute),
    monthName: a.month ?? '',
    weekday: a.weekday ?? '',
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in Berlin time. */
export function berlinDate(ms: number): string {
  const p = berlinParts(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** `YYYY-MM-DD` in UTC. */
export function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Hour of day in Berlin as a float (14.5 = 14:30). */
export function berlinHour(ms: number): number {
  const p = berlinParts(ms);
  return p.hour + p.minute / 60;
}

export function dayOfYear(ms: number): number {
  const d = new Date(ms);
  return Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000);
}

/**
 * Category label for a chart x axis. Labels are plain strings (never `YYYY-MM-DD`) so the kit prints them
 * verbatim, and they are unique within the window they are used for.
 */
export function axisLabel(epochSec: number, bucketSec: number, spanDays: number): string {
  const p = berlinParts(epochSec * 1000);
  if (bucketSec >= 604800 || spanDays > 120) return `${pad(p.day)} ${p.monthName} ${String(p.year).slice(2)}`;
  if (bucketSec >= 86400) return `${pad(p.day)} ${p.monthName}`;
  if (spanDays <= 2) return `${p.weekday} ${pad(p.hour)}:${pad(p.minute)}`;
  return `${pad(p.day)} ${p.monthName} ${pad(p.hour)}h`;
}

export function clockLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  const p = berlinParts(ms);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function dateTimeLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  const p = berlinParts(ms);
  return `${pad(p.day)} ${p.monthName} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** `2026-10` → `Oct 26`. */
export function monthLabel(period: string): string {
  const [y, m] = period.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const name = names[Number(m) - 1];
  return name ? `${name} ${String(y).slice(2)}` : period;
}

/** Mean-aggregate aligned columns into fixed buckets. Null / non-finite samples are skipped. */
export function bucketize<K extends string>(
  t: number[],
  cols: Record<K, (number | null | undefined)[]>,
  bucketSec: number,
): { t: number[]; cols: Record<K, number[]> } {
  const keys = Object.keys(cols) as K[];
  const order: number[] = [];
  const sums = new Map<number, { s: number[]; n: number[] }>();
  for (let i = 0; i < t.length; i++) {
    const b = Math.floor(t[i] / bucketSec) * bucketSec;
    let acc = sums.get(b);
    if (!acc) {
      acc = { s: keys.map(() => 0), n: keys.map(() => 0) };
      sums.set(b, acc);
      order.push(b);
    }
    for (let k = 0; k < keys.length; k++) {
      const v = cols[keys[k]][i];
      if (typeof v === 'number' && Number.isFinite(v)) {
        acc.s[k] += v;
        acc.n[k] += 1;
      }
    }
  }
  order.sort((a, b) => a - b);
  const out = {} as Record<K, number[]>;
  keys.forEach((key, k) => {
    let last = 0;
    out[key] = order.map((b) => {
      const acc = sums.get(b);
      if (acc && acc.n[k] > 0) last = acc.s[k] / acc.n[k];
      return last;
    });
  });
  return { t: order, cols: out };
}

export const round = (v: number, d = 1): number => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

export const last = <T,>(a: T[] | undefined | null): T | undefined => (a && a.length ? a[a.length - 1] : undefined);

export const mean = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

/** Relative change of `now` versus `ref`, 0 when the reference is missing or zero. */
export const rel = (now: number, ref: number | undefined | null): number =>
  typeof ref === 'number' && ref !== 0 && Number.isFinite(ref) ? (now - ref) / Math.abs(ref) : 0;

/** Downsample to at most `n` evenly spaced points (keeps the last point). */
export function sparkOf(values: number[], n = 24): number[] {
  if (values.length <= n) return values.map((v) => round(v, 2));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(round(values[Math.round((i * (values.length - 1)) / (n - 1))], 2));
  return out;
}
