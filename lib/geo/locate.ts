import { STATE_POLYGONS } from '@/lib/geo/state-polygons';

function inRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0] ?? 0;
    const yi = ring[i]?.[1] ?? 0;
    const xj = ring[j]?.[0] ?? 0;
    const yj = ring[j]?.[1] ?? 0;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// City states are tested first: their polygons are enclaves inside the surrounding Land.
const ORDER = ['BE', 'HH', 'HB', ...Object.keys(STATE_POLYGONS).filter((c) => !['BE', 'HH', 'HB'].includes(c))];

/** Bundesland code for a WGS84 coordinate, or null when it lies outside Germany. */
export function locateState(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  for (const code of ORDER) {
    const rings = STATE_POLYGONS[code] ?? [];
    for (const ring of rings) if (inRing(lon, lat, ring)) return code;
  }
  return null;
}
