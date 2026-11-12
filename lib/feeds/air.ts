import type { AirHistory, AirStation, FeedResult } from '@/lib/domain/types';
import { STATE_BY_CODE } from '@/lib/data/states';
import { fetchJson, loadFeed, UpstreamError } from '@/lib/feeds/core';
import { simulateAirHistory, simulateAirStations } from '@/lib/sim/environment';
import { berlinDate, berlinParts } from '@/lib/time';

const UBA = 'https://luftdaten.umweltbundesamt.de/api/air-data/v3';

type Component = [number, number | null, number | null, string?];
type Entry = [string, number | null, number, ...Component[]];
interface AqPayload { data?: Record<string, Record<string, Entry>> }
interface StationPayload { data?: Record<string, (string | number | null)[]> }

function window(hoursBack: number): string {
  const now = Date.now();
  const from = now - hoursBack * 3_600_000;
  const hour = (ms: number) => Math.max(1, berlinParts(ms).hour);
  return `date_from=${berlinDate(from)}&time_from=${hour(from)}&date_to=${berlinDate(now)}&time_to=${hour(now) === 1 ? 24 : hour(now)}`;
}

// UBA timestamps are CET wall-clock; an hour of slack in summer time is irrelevant for an hourly index.
const toSec = (stamp: string): number => Math.floor(Date.parse(`${stamp.replace(' ', 'T')}+01:00`) / 1000);

function comp(entry: Entry, id: number): number | null {
  for (let i = 3; i < entry.length; i++) {
    const c = entry[i] as Component;
    if (Array.isArray(c) && c[0] === id && typeof c[1] === 'number') return c[1];
  }
  return null;
}

async function fetchAq(hoursBack: number): Promise<Record<string, Record<string, Entry>>> {
  const raw = await fetchJson<AqPayload>(`${UBA}/airquality/json?${window(hoursBack)}`, { timeoutMs: 14_000 });
  const data = raw?.data;
  if (!data || typeof data !== 'object' || Object.keys(data).length < 20) throw new UpstreamError('no station data');
  return data;
}

export function getAirStations(): Promise<FeedResult<AirStation[]>> {
  return loadFeed<AirStation[]>('air_quality', {
    empty: [],
    validate: (d) => d.length >= 50,
    simulate: () => simulateAirStations(Date.now()),
    live: async () => {
      const [aq, meta] = await Promise.all([
        fetchAq(4),
        fetchJson<StationPayload>(`${UBA}/stations/json?lang=en&use=airquality&${window(4)}`, { timeoutMs: 14_000 }),
      ]);
      const stations = meta?.data ?? {};
      const out: AirStation[] = [];
      for (const [id, hours] of Object.entries(aq)) {
        const m = stations[id];
        const stamps = Object.keys(hours ?? {}).sort();
        const stamp = stamps[stamps.length - 1];
        const e = stamp ? hours[stamp] : undefined;
        const state = String(m?.[12] ?? '');
        if (!m || !e || typeof e[1] !== 'number' || !STATE_BY_CODE[state]) continue;
        out.push({
          id,
          code: String(m[1] ?? ''),
          name: String(m[2] ?? ''),
          city: String(m[3] ?? ''),
          state,
          setting: String(m[14] ?? ''),
          type: String(m[16] ?? ''),
          lon: Number(m[7]),
          lat: Number(m[8]),
          index: e[1],
          pm10: comp(e, 1),
          pm25: comp(e, 9),
          no2: comp(e, 5),
          o3: comp(e, 3),
          observedAt: new Date(toSec(stamp ?? '') * 1000).toISOString(),
        });
      }
      return out;
    },
  });
}

/** National hourly means over the last 24 h, averaged across all reporting stations. */
export function getAirHistory(): Promise<FeedResult<AirHistory>> {
  return loadFeed<AirHistory>('air_history', {
    empty: { t: [], index: [], pm10: [], pm25: [], no2: [], o3: [], stations: [] },
    validate: (d) => d.t.length >= 6,
    simulate: () => simulateAirHistory(Date.now()),
    live: async () => {
      const aq = await fetchAq(26);
      const acc = new Map<string, { n: number; idx: number; s: number[]; c: number[] }>();
      const ids = [1, 9, 5, 3];
      for (const hours of Object.values(aq)) {
        for (const [stamp, e] of Object.entries(hours ?? {})) {
          if (typeof e?.[1] !== 'number') continue;
          let a = acc.get(stamp);
          if (!a) {
            a = { n: 0, idx: 0, s: [0, 0, 0, 0], c: [0, 0, 0, 0] };
            acc.set(stamp, a);
          }
          a.n++;
          a.idx += e[1];
          ids.forEach((id, k) => {
            const v = comp(e, id);
            if (v !== null && a) {
              a.s[k] += v;
              a.c[k]++;
            }
          });
        }
      }
      const stamps = [...acc.keys()].sort();
      const peak = Math.max(...stamps.map((s) => acc.get(s)?.n ?? 0));
      const h: AirHistory = { t: [], index: [], pm10: [], pm25: [], no2: [], o3: [], stations: [] };
      for (const stamp of stamps) {
        const a = acc.get(stamp);
        // The newest hour is published station by station; skip it until most stations have reported.
        if (!a || a.n < peak * 0.5) continue;
        const avg = (k: number) => (a.c[k] > 0 ? Math.round((a.s[k] / a.c[k]) * 10) / 10 : 0);
        h.t.push(toSec(stamp));
        h.index.push(Math.round((a.idx / a.n) * 100) / 100);
        h.pm10.push(avg(0));
        h.pm25.push(avg(1));
        h.no2.push(avg(2));
        h.o3.push(avg(3));
        h.stations.push(a.n);
      }
      return h;
    },
  });
}
