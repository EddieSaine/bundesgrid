import type { FeedResult, RailSnapshot, TrafficEvent, TrafficKind, TrafficSnapshot } from '@/lib/domain/types';
import { fetchJson, loadFeed, mapLimit } from '@/lib/feeds/core';
import { locateState } from '@/lib/geo/locate';
import { CORE_ROADS, simulateRail, simulateTraffic } from '@/lib/sim/society';

const BASE = 'https://verkehr.autobahn.de/o/autobahn';

interface AbItem {
  identifier?: string; isBlocked?: string | boolean; future?: boolean; display_type?: string; title?: string; subtitle?: string;
  coordinate?: { lat?: string | number; long?: string | number }; description?: string[];
}

const SERVICES: [TrafficKind, string][] = [['roadworks', 'roadworks'], ['closure', 'closure'], ['warning', 'warning']];

function lengthOf(desc: string[] | undefined): number | null {
  for (const line of desc ?? []) {
    const m = /Länge:\s*([\d.,]+)\s*km/i.exec(line);
    if (m) {
      const v = Number(m[1].replace(',', '.'));
      return Number.isFinite(v) ? v : null;
    }
  }
  return null;
}

/** Roadworks, closures and traffic warnings on the 24 busiest Autobahnen (the core network). */
export function getTraffic(): Promise<FeedResult<TrafficSnapshot>> {
  return loadFeed<TrafficSnapshot>('autobahn', {
    empty: { roads: [], events: [] },
    validate: (d) => d.roads.length >= CORE_ROADS.length / 2,
    simulate: () => simulateTraffic(Date.now()),
    live: async () => {
      const jobs = CORE_ROADS.flatMap((road) => SERVICES.map(([kind, path]) => ({ road, kind, path })));
      const okRoads = new Set<string>();
      const lists = await mapLimit(jobs, 12, async ({ road, kind, path }) => {
        const raw = await fetchJson<Record<string, AbItem[]>>(`${BASE}/${road}/services/${path}`, { timeoutMs: 9_000 });
        const items = raw?.[path] ?? [];
        okRoads.add(road);
        return items.map((it): TrafficEvent => {
          const lat = Number(it.coordinate?.lat);
          const lon = Number(it.coordinate?.long);
          return {
            id: it.identifier ?? `${road}-${kind}-${it.title ?? ''}`,
            road,
            kind,
            title: (it.title ?? '').slice(0, 140),
            subtitle: (it.subtitle ?? '').trim().slice(0, 140),
            blocked: String(it.isBlocked) === 'true',
            future: Boolean(it.future),
            displayType: it.display_type ?? kind.toUpperCase(),
            lengthKm: lengthOf(it.description),
            lat,
            lon,
            state: locateState(lat, lon),
          };
        });
      });
      return { roads: CORE_ROADS.filter((r) => okRoads.has(r)), events: lists.flatMap((l) => l ?? []) };
    },
  });
}

/** Rail punctuality is modelled by design: there is no keyless open real-time API. */
export function getRail(): Promise<FeedResult<RailSnapshot>> {
  return loadFeed<RailSnapshot>('rail', {
    empty: { longDistancePunctuality: 0, regionalPunctuality: 0, cancellationRate: 0, avgDelayMin: 0, trainsRunning: 0, hubs: [], lines: [], hourly: [], causes: [] },
    simulate: () => simulateRail(Date.now()),
  });
}
