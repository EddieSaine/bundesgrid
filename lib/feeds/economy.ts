import type { FeedResult, FxSnapshot, Horizon, IndexQuote, PeriodSeries } from '@/lib/domain/types';
import { fetchJson, loadFeed, mapLimit, UpstreamError } from '@/lib/feeds/core';
import { FX_SYMBOLS, INDEX_SPECS, simulateFx, simulateGdp, simulateIfo, simulateIndices, simulateInflation, simulateInsolvencies, simulateUnemployment } from '@/lib/sim/society';
import { utcDate } from '@/lib/time';

export const FX_HORIZONS: Horizon[] = ['30d', '1y'];

export function getFx(h: Horizon): Promise<FeedResult<FxSnapshot>> {
  const days = h === '1y' ? 365 : 45;
  return loadFeed<FxSnapshot>('fx_rates', {
    key: `fx_rates:${h}`,
    empty: { date: '', rates: {}, previous: {}, dates: [], series: {} },
    validate: (d) => d.dates.length >= 2 && Object.keys(d.rates).length >= 5,
    simulate: () => simulateFx(Date.now(), days),
    live: async () => {
      const start = utcDate(Date.now() - days * 86_400_000);
      const raw = await fetchJson<{ rates?: Record<string, Record<string, number>> }>(
        `https://api.frankfurter.dev/v1/${start}..?base=EUR&symbols=${FX_SYMBOLS.join(',')}`,
        { timeoutMs: 10_000 },
      );
      const dates = Object.keys(raw?.rates ?? {}).sort();
      if (dates.length < 2) throw new UpstreamError('no rates');
      const series: Record<string, number[]> = {};
      const rates: Record<string, number> = {};
      const previous: Record<string, number> = {};
      for (const s of FX_SYMBOLS) {
        const a = dates.map((d) => raw?.rates?.[d]?.[s]).filter((v): v is number => typeof v === 'number');
        if (a.length !== dates.length) continue;
        series[s] = a;
        rates[s] = a[a.length - 1];
        previous[s] = a[a.length - 2];
      }
      return { date: dates[dates.length - 1], rates, previous, dates, series };
    },
  });
}

interface YahooChart {
  chart?: { result?: { meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number; regularMarketDayHigh?: number; regularMarketDayLow?: number }; timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
}
const YAHOO: Record<Horizon, { range: string; interval: string; days: number }> = {
  '24h': { range: '1d', interval: '5m', days: 1 },
  '7d': { range: '5d', interval: '30m', days: 7 },
  '30d': { range: '1mo', interval: '1d', days: 30 },
  '1y': { range: '1y', interval: '1d', days: 365 },
};

export function getIndices(h: Horizon): Promise<FeedResult<IndexQuote[]>> {
  const y = YAHOO[h];
  return loadFeed<IndexQuote[]>('equity_indices', {
    key: `equity_indices:${h}`,
    ttlMs: h === '24h' ? 2 * 60_000 : 15 * 60_000,
    empty: [],
    validate: (d) => d.length >= 3,
    simulate: () => simulateIndices(Date.now(), y.days),
    live: async () => {
      const rows = await mapLimit(INDEX_SPECS, 5, async ({ symbol, name }) => {
        const raw = await fetchJson<YahooChart>(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${y.range}&interval=${y.interval}`,
          { timeoutMs: 8_000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DeutschlandDashboard/1.0)' } },
        );
        const r = raw?.chart?.result?.[0];
        const price = r?.meta?.regularMarketPrice;
        if (!r || typeof price !== 'number') throw new UpstreamError('no quote');
        const t: number[] = [];
        const close: number[] = [];
        (r.timestamp ?? []).forEach((s, i) => {
          const c = r.indicators?.quote?.[0]?.close?.[i];
          if (typeof c === 'number') {
            t.push(s);
            close.push(Math.round(c * 100) / 100);
          }
        });
        // For multi-day ranges `chartPreviousClose` is the close before the range, so derive the prior session from the bars.
        const prev = h === '24h' ? r.meta?.chartPreviousClose ?? r.meta?.previousClose : y.interval === '1d' ? close[close.length - 2] : r.meta?.previousClose;
        const q: IndexQuote = {
          symbol,
          name,
          price,
          previousClose: typeof prev === 'number' ? prev : close[0] ?? price,
          dayHigh: r.meta?.regularMarketDayHigh ?? price,
          dayLow: r.meta?.regularMarketDayLow ?? price,
          t,
          close,
        };
        return q;
      });
      return rows.filter((r): r is IndexQuote => r !== null);
    },
  });
}

interface EcbPayload {
  dataSets?: { series?: Record<string, { observations?: Record<string, (number | null)[]> }> }[];
  structure?: { dimensions?: { observation?: { values?: { id?: string }[] }[] } };
}
interface EurostatPayload { value?: Record<string, number>; dimension?: { time?: { category?: { index?: Record<string, number> } } } }

const validPeriods = (d: PeriodSeries) => d.periods.length >= 6;
const EMPTY: PeriodSeries = { periods: [], values: [], unit: '' };

export function getInflation(): Promise<FeedResult<PeriodSeries>> {
  return loadFeed<PeriodSeries>('inflation', {
    empty: EMPTY,
    validate: validPeriods,
    simulate: () => simulateInflation(Date.now()),
    live: async () => {
      const raw = await fetchJson<EcbPayload>('https://data-api.ecb.europa.eu/service/data/ICP/M.DE.N.000000.4.ANR?lastNObservations=25&format=jsondata', { timeoutMs: 12_000 });
      const obs = Object.values(raw?.dataSets?.[0]?.series ?? {})[0]?.observations ?? {};
      const ids = raw?.structure?.dimensions?.observation?.[0]?.values ?? [];
      const out: PeriodSeries = { periods: [], values: [], unit: '% y/y' };
      ids.forEach((p, i) => {
        const v = obs[String(i)]?.[0];
        if (p?.id && typeof v === 'number') {
          out.periods.push(p.id);
          out.values.push(v);
        }
      });
      return out;
    },
  });
}

async function eurostat(query: string, unit: string): Promise<PeriodSeries> {
  const raw = await fetchJson<EurostatPayload>(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${query}&format=JSON`, { timeoutMs: 12_000 });
  const index = raw?.dimension?.time?.category?.index ?? {};
  const out: PeriodSeries = { periods: [], values: [], unit };
  for (const [period, i] of Object.entries(index).sort((a, b) => a[1] - b[1])) {
    const v = raw?.value?.[String(i)];
    if (typeof v === 'number') {
      out.periods.push(period);
      out.values.push(v);
    }
  }
  return out;
}

export function getUnemployment(): Promise<FeedResult<PeriodSeries>> {
  return loadFeed<PeriodSeries>('unemployment', {
    empty: EMPTY,
    validate: validPeriods,
    simulate: () => simulateUnemployment(Date.now()),
    live: () => eurostat('une_rt_m?geo=DE&s_adj=SA&age=TOTAL&unit=PC_ACT&sex=T&lastTimePeriod=25', '% of labour force'),
  });
}

export function getGdp(): Promise<FeedResult<PeriodSeries>> {
  return loadFeed<PeriodSeries>('gdp', {
    empty: EMPTY,
    validate: validPeriods,
    simulate: () => simulateGdp(Date.now()),
    live: () => eurostat('namq_10_gdp?geo=DE&unit=CLV_PCH_PRE&s_adj=SCA&na_item=B1GQ&lastTimePeriod=12', '% q/q'),
  });
}

export type IfoFrame = { climate: PeriodSeries; situation: PeriodSeries; expectations: PeriodSeries };

/** Modelled by design: the ifo Institute does not offer an open API. */
export function getIfo(): Promise<FeedResult<IfoFrame>> {
  return loadFeed<IfoFrame>('ifo_index', { empty: { climate: EMPTY, situation: EMPTY, expectations: EMPTY }, simulate: () => simulateIfo(Date.now()) });
}

/** Modelled by design: Destatis insolvency statistics are not available through a keyless API. */
export function getInsolvencies(): Promise<FeedResult<PeriodSeries>> {
  return loadFeed<PeriodSeries>('insolvencies', { empty: EMPTY, simulate: () => simulateInsolvencies(Date.now()) });
}
