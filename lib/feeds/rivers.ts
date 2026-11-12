import type { FeedResult, Gauge, GaugeHistory, GaugeStatus, Horizon } from '@/lib/domain/types';
import { fetchJson, loadFeed, mapLimit, UpstreamError } from '@/lib/feeds/core';
import { locateState } from '@/lib/geo/locate';
import { GAUGE_SPECS, simulateGaugeHistory, simulateGauges } from '@/lib/sim/environment';
import { bucketize, HORIZONS } from '@/lib/time';

const PO = 'https://www.pegelonline.wsv.de/webservices/rest-api/v2';
const WATERS = 'RHEIN,ELBE,DONAU,MAIN,MOSEL,WESER,ODER,NECKAR';

interface PoSeries {
  shortname?: string;
  currentMeasurement?: { timestamp?: string; value?: number; stateMnwMhw?: string };
  characteristicValues?: { shortname?: string; value?: number }[];
}
interface PoStation { uuid?: string; shortname?: string; km?: number; longitude?: number; latitude?: number; water?: { shortname?: string }; timeseries?: PoSeries[] }

/** Featured shipping gauges shown in the headline tiles and the history charts. */
export const KEY_GAUGES = GAUGE_SPECS.map((g) => g.name);
export const HISTORY_GAUGES = ['KAUB', 'KÖLN', 'MAXAU', 'DRESDEN', 'MAGDEBURG-STROMBRÜCKE', 'PASSAU DONAU'];
export const RIVER_HORIZONS: Horizon[] = ['24h', '7d', '30d'];

export function getGauges(): Promise<FeedResult<Gauge[]>> {
  return loadFeed<Gauge[]>('water_levels', {
    empty: [],
    validate: (d) => d.length >= 10,
    simulate: () => simulateGauges(Date.now()),
    live: async () => {
      const raw = await fetchJson<PoStation[]>(
        `${PO}/stations.json?waters=${WATERS}&includeTimeseries=true&includeCurrentMeasurement=true&includeCharacteristicValues=true`,
        { timeoutMs: 14_000 },
      );
      if (!Array.isArray(raw)) throw new UpstreamError('malformed station list');
      const cutoff = Date.now() - 36 * 3_600_000;
      const out: Gauge[] = [];
      for (const s of raw) {
        const w = s.timeseries?.find((x) => x.shortname === 'W');
        const m = w?.currentMeasurement;
        const ts = Date.parse(m?.timestamp ?? '');
        if (typeof m?.value !== 'number' || !Number.isFinite(ts) || ts < cutoff) continue;
        const cv = (k: string): number | null => {
          const v = w?.characteristicValues?.find((c) => c.shortname === k)?.value;
          return typeof v === 'number' ? v : null;
        };
        const q = s.timeseries?.find((x) => x.shortname === 'Q')?.currentMeasurement?.value;
        const st = m.stateMnwMhw;
        out.push({
          id: s.uuid ?? s.shortname ?? '',
          name: s.shortname ?? '',
          water: s.water?.shortname ?? '',
          km: s.km ?? 0,
          lat: s.latitude ?? 0,
          lon: s.longitude ?? 0,
          state: locateState(s.latitude ?? NaN, s.longitude ?? NaN),
          levelCm: Math.round(m.value),
          observedAt: new Date(ts).toISOString(),
          dischargeM3s: typeof q === 'number' ? Math.round(q) : null,
          meanWaterCm: cv('MW'),
          meanLowCm: cv('MNW'),
          meanHighCm: cv('MHW'),
          highestNavigableCm: cv('HSW'),
          status: (st === 'low' || st === 'normal' || st === 'high' ? st : 'unknown') as GaugeStatus,
        });
      }
      return out;
    },
  });
}

export function getGaugeHistory(h: Horizon): Promise<FeedResult<GaugeHistory[]>> {
  const days = HORIZONS[h].days;
  const bucketSec = h === '24h' ? 900 : h === '7d' ? 3_600 : 21_600;
  return loadFeed<GaugeHistory[]>('water_history', {
    key: `water_history:${h}`,
    ttlMs: (h === '24h' ? 20 : 60) * 60_000,
    empty: [],
    validate: (d) => d.length >= 3,
    simulate: () => simulateGaugeHistory(Date.now(), days, bucketSec, HISTORY_GAUGES),
    live: async () => {
      const rows = await mapLimit(HISTORY_GAUGES, 6, async (name) => {
        const raw = await fetchJson<{ timestamp?: string; value?: number }[]>(
          `${PO}/stations/${encodeURIComponent(name)}/W/measurements.json?start=P${days}D`,
          { timeoutMs: 14_000 },
        );
        if (!Array.isArray(raw) || raw.length < 4) throw new UpstreamError('no measurements');
        const t = raw.map((r) => Math.floor(Date.parse(r.timestamp ?? '') / 1000));
        const b = bucketize(t, { v: raw.map((r) => (typeof r.value === 'number' ? r.value : null)) }, bucketSec);
        const g = GAUGE_SPECS.find((x) => x.name === name);
        const row: GaugeHistory = { name, water: g?.water ?? '', t: b.t, levelCm: b.cols.v.map((v) => Math.round(v)) };
        return row;
      });
      return rows.filter((r): r is GaugeHistory => r !== null);
    },
  });
}
