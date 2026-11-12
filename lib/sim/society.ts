/** Simulators for mobility and the economy. Deterministic in time. */
import type { FxSnapshot, IndexQuote, PeriodSeries, RailHub, RailLine, RailSnapshot, TrafficEvent, TrafficKind, TrafficSnapshot } from '@/lib/domain/types';
import { STATES } from '@/lib/data/states';
import { clamp, fbm, hash01, strSeed } from '@/lib/sim/noise';
import { berlinHour, berlinParts, utcDate } from '@/lib/time';

const HOUR = 3600;
const S = (k: string) => strSeed(`soc:${k}`);

// ---------- Autobahn ----------
export const CORE_ROADS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A14', 'A20', 'A24', 'A27', 'A30', 'A31', 'A40', 'A44', 'A45', 'A61', 'A81', 'A93', 'A96', 'A99'];

const ROAD_STATES: Record<string, string[]> = {
  A1: ['SH', 'HH', 'NI', 'HB', 'NW', 'RP', 'SL'], A2: ['NW', 'NI', 'ST', 'BB'], A3: ['NW', 'RP', 'HE', 'BY'], A4: ['NW', 'HE', 'TH', 'SN'],
  A5: ['HE', 'BW'], A6: ['SL', 'RP', 'BW', 'BY'], A7: ['SH', 'HH', 'NI', 'HE', 'BY', 'BW'], A8: ['SL', 'RP', 'BW', 'BY'], A9: ['BB', 'ST', 'TH', 'BY'],
  A10: ['BB', 'BE'], A14: ['MV', 'BB', 'ST', 'SN'], A20: ['SH', 'MV', 'BB'], A24: ['HH', 'SH', 'MV', 'BB'], A27: ['NI', 'HB'], A30: ['NI', 'NW'],
  A31: ['NI', 'NW'], A40: ['NW'], A44: ['NW', 'HE'], A45: ['NW', 'HE', 'BY'], A61: ['NW', 'RP', 'BW'], A81: ['BY', 'BW'], A93: ['BY'], A96: ['BY', 'BW'], A99: ['BY'],
};

export function simulateTraffic(nowMs: number): TrafficSnapshot {
  const day = Math.floor(nowMs / 86_400_000);
  const slot = Math.floor(nowMs / (HOUR * 1000));
  const events: TrafficEvent[] = [];
  for (const road of CORE_ROADS) {
    const states = ROAD_STATES[road] ?? ['NW'];
    const works = 18 + Math.floor(hash01(day, S(`rw:${road}`)) * 55) + states.length * 6;
    const make = (kind: TrafficKind, i: number, seedBase: number) => {
      const code = states[Math.floor(hash01(seedBase + i, S(`st:${road}`)) * states.length)] ?? states[0];
      const st = STATES.find((x) => x.code === code);
      const r = hash01(seedBase + i * 3, S(`ev:${road}:${kind}`));
      events.push({
        id: `sim-${road}-${kind}-${i}`,
        road,
        kind,
        title: kind === 'roadworks' ? `${road} | roadworks near ${st?.capital ?? code} (model)` : kind === 'closure' ? `${road} | carriageway closed (model)` : `${road} | congestion ${Math.round(2 + r * 9)} km (model)`,
        subtitle: `Direction ${r > 0.5 ? 'north/east' : 'south/west'}`,
        blocked: kind === 'closure' ? r > 0.4 : false,
        future: kind === 'roadworks' ? r > 0.82 : false,
        displayType: kind === 'roadworks' ? (r > 0.7 ? 'SHORT_TERM_ROADWORKS' : 'ROADWORKS') : kind === 'closure' ? 'CLOSURE' : 'WARNING',
        lengthKm: kind === 'warning' ? Math.round((2 + r * 9) * 10) / 10 : Math.round((0.4 + r * r * 11) * 10) / 10,
        lat: (st?.lat ?? 51) + (r - 0.5) * 0.9,
        lon: (st?.lon ?? 10) + (hash01(i, S(`lo:${road}`)) - 0.5) * 0.9,
        state: code,
      });
    };
    for (let i = 0; i < works; i++) make('roadworks', i, day);
    const closures = Math.floor(hash01(day, S(`cl:${road}`)) * 5);
    for (let i = 0; i < closures; i++) make('closure', i, day);
    const h = berlinHour(nowMs);
    const rush = Math.exp(-((h - 8) ** 2) / 4) + Math.exp(-((h - 17) ** 2) / 5);
    const warnings = Math.floor((0.5 + 5 * rush) * hash01(slot, S(`wa:${road}`)) * 1.6);
    for (let i = 0; i < warnings; i++) make('warning', i, slot);
  }
  return { roads: CORE_ROADS, events };
}

// ---------- Rail (modelled by design: Deutsche Bahn publishes no keyless real-time punctuality API) ----------
const HUBS: [string, string, number][] = [
  ['Berlin Hbf', 'BE', 62], ['Hamburg Hbf', 'HH', 68], ['München Hbf', 'BY', 64], ['Frankfurt (Main) Hbf', 'HE', 66], ['Köln Hbf', 'NW', 70],
  ['Stuttgart Hbf', 'BW', 52], ['Hannover Hbf', 'NI', 48], ['Düsseldorf Hbf', 'NW', 50], ['Nürnberg Hbf', 'BY', 44], ['Leipzig Hbf', 'SN', 40],
  ['Dortmund Hbf', 'NW', 42], ['Essen Hbf', 'NW', 41], ['Bremen Hbf', 'HB', 30], ['Dresden Hbf', 'SN', 28], ['Mannheim Hbf', 'BW', 36], ['Karlsruhe Hbf', 'BW', 30],
];
const LINES: [string, string, RailLine['category'], number][] = [
  ['ICE 1', 'Hamburg – Köln – Frankfurt – Basel', 'ICE', -9], ['ICE 10', 'Berlin – Hannover – Köln', 'ICE', -4], ['ICE 11', 'Berlin – Frankfurt – Stuttgart – München', 'ICE', -7],
  ['ICE 18', 'Hamburg – Berlin – Leipzig – München', 'ICE', -2], ['ICE 28', 'Hamburg – Berlin – Nürnberg – München', 'ICE', -3], ['ICE 41', 'Dortmund – Köln – Frankfurt – München', 'ICE', -8],
  ['ICE 42', 'Dortmund – Köln – Stuttgart – München', 'ICE', -10], ['IC 30', 'Hamburg – Köln – Stuttgart', 'IC', -6], ['IC 55', 'Dresden – Leipzig – Hannover – Köln', 'IC', -1],
  ['RE 1', 'Aachen – Köln – Hamm (RRX)', 'RE', -6], ['RE 5', 'Rostock – Berlin – Elsterwerda', 'RE', 1], ['RE 50', 'Frankfurt – Fulda', 'RE', 0],
  ['S 1', 'S-Bahn München Stammstrecke', 'S-Bahn', 2], ['S 3', 'S-Bahn Hamburg', 'S-Bahn', 3], ['S 41/42', 'Berliner Ringbahn', 'S-Bahn', 5], ['S 6', 'S-Bahn Rhein-Main', 'S-Bahn', 1],
];

function networkStress(sec: number): number {
  const h = berlinHour(sec * 1000);
  const rush = Math.exp(-((h - 8) ** 2) / 5) + 1.2 * Math.exp(-((h - 17.5) ** 2) / 7);
  const night = h < 5 ? -0.5 : 0;
  return clamp(0.42 + 0.3 * rush + night * 0.4 + 0.3 * fbm(S('stress'), sec / (HOUR * 7)) + 0.06 * fbm(S('micro'), sec / 240), 0, 1.3);
}

export function simulateRail(nowMs: number): RailSnapshot {
  const sec = Math.floor(nowMs / 1000 / 5) * 5;
  const stress = networkStress(sec);
  const h = berlinHour(nowMs);
  const service = h < 4.5 ? 0.18 : h < 6 ? 0.6 : h > 22.5 ? 0.45 : 1;
  const ld = clamp(78 - 27 * stress, 38, 92);
  const reg = clamp(95.5 - 9 * stress, 78, 98);
  const hubs: RailHub[] = HUBS.map(([station, state, dep]) => {
    const local = fbm(S(`hub:${station}`), sec / (HOUR * 2)) + 0.3 * fbm(S(`hubm:${station}`), sec / 90);
    const punctuality = clamp(ld + 9 + 9 * local, 35, 99);
    return {
      station,
      state,
      punctuality: Math.round(punctuality * 10) / 10,
      avgDelayMin: Math.round(clamp((100 - punctuality) * 0.21 + 1.2, 0.5, 30) * 10) / 10,
      departuresPerHour: Math.round(dep * service * (1 + 0.05 * local)),
      cancelled: Math.max(0, Math.round(dep * service * 0.022 * (1 + stress + local))),
    };
  });
  const lines: RailLine[] = LINES.map(([line, route, category, bias]) => {
    const base = category === 'ICE' || category === 'IC' ? ld : reg;
    const punctuality = clamp(base + bias + 7 * fbm(S(`line:${line}`), sec / (HOUR * 1.5)), 30, 99.5);
    return { line, route, category, punctuality: Math.round(punctuality * 10) / 10, avgDelayMin: Math.round(clamp((100 - punctuality) * 0.24 + 0.8, 0.3, 40) * 10) / 10 };
  });
  const hourly: RailSnapshot['hourly'] = [];
  const endHour = Math.floor(sec / HOUR) * HOUR;
  for (let s = endHour - 23 * HOUR; s <= endHour; s += HOUR) {
    const st = networkStress(s + 1800);
    hourly.push({ t: s, longDistance: Math.round(clamp(78 - 27 * st, 38, 92) * 10) / 10, regional: Math.round(clamp(95.5 - 9 * st, 78, 98) * 10) / 10 });
  }
  const w = (k: string, base: number) => base * (1 + 0.25 * fbm(S(`cause:${k}`), sec / (HOUR * 8)));
  const raw: [string, number][] = [
    ['Infrastructure faults & construction', w('infra', 34)], ['Knock-on delays from other trains', w('knock', 27)], ['Rolling stock defects', w('stock', 12)],
    ['Staff shortages', w('staff', 8)], ['Weather', w('weather', 6)], ['External events & trespassers', w('ext', 13)],
  ];
  const total = raw.reduce((a, [, v]) => a + v, 0);
  return {
    longDistancePunctuality: Math.round(ld * 10) / 10,
    regionalPunctuality: Math.round(reg * 10) / 10,
    cancellationRate: Math.round(clamp(1.4 + 2.6 * stress, 0.5, 9) * 10) / 10,
    avgDelayMin: Math.round(clamp(2.2 + 7.5 * stress, 1, 25) * 10) / 10,
    trainsRunning: Math.round((2_650 + 420 * fbm(S('trains'), sec / 600)) * service),
    hubs,
    lines,
    hourly,
    causes: raw.map(([cause, v]) => ({ cause, share: Math.round((v / total) * 1000) / 10 })),
  };
}

// ---------- FX ----------
const FX_BASE: Record<string, number> = {
  USD: 1.085, GBP: 0.853, CHF: 0.948, JPY: 163.2, PLN: 4.31, CZK: 25.1, SEK: 11.42, NOK: 11.68, DKK: 7.46, CNY: 7.82, TRY: 37.5, HUF: 398,
};
export const FX_SYMBOLS = Object.keys(FX_BASE);

function fxAt(sym: string, day: number): number {
  const base = FX_BASE[sym] ?? 1;
  const vol = sym === 'DKK' ? 0.001 : sym === 'TRY' ? 0.09 : 0.035;
  return base * (1 + vol * fbm(S(`fx:${sym}`), day / 45) + vol * 0.12 * fbm(S(`fxd:${sym}`), day / 2));
}

export function simulateFx(nowMs: number, days: number): FxSnapshot {
  const today = Math.floor(nowMs / 86_400_000);
  const dates: string[] = [];
  const series: Record<string, number[]> = Object.fromEntries(FX_SYMBOLS.map((s) => [s, [] as number[]]));
  for (let d = today - days; d <= today; d++) {
    const wd = new Date(d * 86_400_000).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    dates.push(utcDate(d * 86_400_000));
    for (const s of FX_SYMBOLS) series[s].push(Number(fxAt(s, d).toPrecision(5)));
  }
  const rates: Record<string, number> = {};
  const previous: Record<string, number> = {};
  for (const s of FX_SYMBOLS) {
    const a = series[s] ?? [];
    rates[s] = a[a.length - 1] ?? FX_BASE[s];
    previous[s] = a[a.length - 2] ?? rates[s];
  }
  return { date: dates[dates.length - 1] ?? utcDate(nowMs), rates, previous, dates, series };
}

// ---------- equity indices ----------
export const INDEX_SPECS: { symbol: string; name: string; base: number }[] = [
  { symbol: '^GDAXI', name: 'DAX 40', base: 24_800 },
  { symbol: '^MDAXI', name: 'MDAX', base: 30_900 },
  { symbol: '^SDAXI', name: 'SDAX', base: 17_300 },
  { symbol: '^TECDAX', name: 'TecDAX', base: 3_820 },
  { symbol: '^STOXX50E', name: 'Euro Stoxx 50', base: 5_640 },
];

function indexAt(symbol: string, base: number, sec: number): number {
  const d = sec / 86_400;
  return base * (1 + 0.11 * fbm(S(`ix:${symbol}`), d / 120) + 0.035 * fbm(S('ix:market'), d / 14) + 0.007 * fbm(S(`ixi:${symbol}`), sec / 2_400));
}

/** `days` 1 → 5-min bars of the current/last Xetra session; otherwise daily (or 30-min for ≤7 d) closes. */
export function simulateIndices(nowMs: number, days: number): IndexQuote[] {
  const nowSec = Math.floor(nowMs / 1000);
  const step = days <= 1 ? 300 : days <= 7 ? 1_800 : 86_400;
  return INDEX_SPECS.map(({ symbol, name, base }) => {
    const t: number[] = [];
    const close: number[] = [];
    for (let s = Math.floor((nowSec - days * 86_400) / step) * step; s <= nowSec; s += step) {
      const p = berlinParts(s * 1000);
      if (p.weekday === 'Sat' || p.weekday === 'Sun') continue;
      if (step < 86_400 && (p.hour < 9 || p.hour > 17 || (p.hour === 17 && p.minute > 35))) continue;
      t.push(s);
      close.push(Math.round(indexAt(symbol, base, s) * 100) / 100);
    }
    const price = close[close.length - 1] ?? base;
    const previousClose = Math.round(indexAt(symbol, base, Math.floor(nowSec / 86_400) * 86_400 - 6 * HOUR) * 100) / 100;
    const day = close.slice(-Math.max(2, Math.round(31_000 / step)));
    return { symbol, name, price, previousClose, dayHigh: Math.max(price, ...day), dayLow: Math.min(price, ...day), t, close };
  });
}

// ---------- macro ----------
function months(nowMs: number, n: number, lag: number): string[] {
  const d = new Date(nowMs);
  const out: string[] = [];
  for (let i = n - 1 + lag; i >= lag; i--) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(`${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
const monthIdx = (p: string): number => Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7));

export function simulateInflation(nowMs: number): PeriodSeries {
  const periods = months(nowMs, 25, 1);
  return { periods, values: periods.map((p) => Math.round((2.2 + 0.5 * fbm(S('hicp'), monthIdx(p) / 7)) * 10) / 10), unit: '% y/y' };
}

export function simulateUnemployment(nowMs: number): PeriodSeries {
  const periods = months(nowMs, 25, 2);
  return { periods, values: periods.map((p) => Math.round((3.8 + 0.35 * fbm(S('une'), monthIdx(p) / 14)) * 10) / 10), unit: '% of labour force' };
}

export function simulateGdp(nowMs: number): PeriodSeries {
  const d = new Date(nowMs);
  const q0 = d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3) - 1;
  const periods: string[] = [];
  const values: number[] = [];
  for (let q = q0 - 11; q <= q0; q++) {
    periods.push(`${Math.floor(q / 4)}-Q${(q % 4) + 1}`);
    values.push(Math.round((0.1 + 0.45 * fbm(S('gdp'), q / 3)) * 10) / 10);
  }
  return { periods, values, unit: '% q/q' };
}

/** ifo Business Climate (2015 = 100), modelled: the ifo Institute publishes no open API. */
export function simulateIfo(nowMs: number): { climate: PeriodSeries; situation: PeriodSeries; expectations: PeriodSeries } {
  const periods = months(nowMs, 25, 1);
  const mk = (k: string, base: number, amp: number): PeriodSeries => ({
    periods,
    values: periods.map((p) => Math.round((base + amp * fbm(S(`ifo:${k}`), monthIdx(p) / 9) + 0.25 * (monthIdx(p) - monthIdx(periods[0] ?? p)) / 6) * 10) / 10),
    unit: 'index 2015 = 100',
  });
  const situation = mk('sit', 85.6, 2.4);
  const expectations = mk('exp', 88.2, 3.1);
  const climate: PeriodSeries = { periods, values: periods.map((_, i) => Math.round(Math.sqrt((situation.values[i] ?? 86) * (expectations.values[i] ?? 88)) * 10) / 10), unit: 'index 2015 = 100' };
  return { climate, situation, expectations };
}

/** Corporate insolvency filings per month, modelled around the level reported by Destatis. */
export function simulateInsolvencies(nowMs: number): PeriodSeries {
  const periods = months(nowMs, 25, 2);
  return {
    periods,
    values: periods.map((p) => Math.round(1_780 + 16 * (monthIdx(p) - monthIdx(periods[0] ?? p)) + 190 * fbm(S('insolv'), monthIdx(p) / 3))),
    unit: 'filings per month',
  };
}
