import type { AlertSeverity, CityWeatherHistory, CivilWarning, FeedResult, Horizon, StateWeather, WeatherAlert } from '@/lib/domain/types';
import { STATES, STATE_BY_AGS, STATE_BY_CODE } from '@/lib/data/states';
import { fetchJson, loadFeed, mapLimit, UpstreamError } from '@/lib/feeds/core';
import { simulateAlerts, simulateCivilWarnings, simulateWeather, simulateWeatherHistory } from '@/lib/sim/environment';
import { berlinDate, HORIZONS } from '@/lib/time';

const BS = 'https://api.brightsky.dev';
const MIN = 60_000;

interface BsObs {
  timestamp?: string; temperature?: number | null; wind_speed_10?: number | null; wind_gust_speed_10?: number | null; wind_direction_10?: number | null;
  precipitation_60?: number | null; relative_humidity?: number | null; pressure_msl?: number | null; cloud_cover?: number | null; sunshine_60?: number | null;
  visibility?: number | null; condition?: string | null; icon?: string | null;
}
interface BsCurrent { weather?: BsObs; sources?: { station_name?: string }[] }
interface BsHour { timestamp?: string; temperature?: number | null; wind_speed?: number | null; precipitation?: number | null }
interface BsAlert {
  id?: number | string; effective?: string; onset?: string; expires?: string | null; severity?: string; urgency?: string;
  event_en?: string | null; event_de?: string | null; headline_en?: string | null; headline_de?: string | null; description_en?: string | null; warn_cell_ids?: number[];
}

const n = (v: number | null | undefined, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const title = (s: string): string => s.toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());

export function getWeatherNow(): Promise<FeedResult<StateWeather[]>> {
  return loadFeed<StateWeather[]>('weather_current', {
    empty: [],
    validate: (d) => d.length >= 12,
    simulate: () => simulateWeather(Date.now()),
    live: async () => {
      const rows = await mapLimit(STATES, 8, async (s) => {
        const raw = await fetchJson<BsCurrent>(`${BS}/current_weather?lat=${s.lat}&lon=${s.lon}`, { timeoutMs: 8_000 });
        const w = raw?.weather;
        if (!w || typeof w.temperature !== 'number') throw new UpstreamError('no observation');
        const row: StateWeather = {
          code: s.code,
          name: s.name,
          capital: s.capital,
          station: title(raw?.sources?.[0]?.station_name ?? s.capital),
          temperature: n(w.temperature),
          windSpeed: n(w.wind_speed_10),
          windGust: n(w.wind_gust_speed_10),
          windDirection: n(w.wind_direction_10),
          precipitation60: n(w.precipitation_60),
          humidity: n(w.relative_humidity),
          pressure: n(w.pressure_msl, 1013),
          cloudCover: n(w.cloud_cover),
          sunshine60: n(w.sunshine_60),
          visibility: n(w.visibility),
          condition: w.icon ?? w.condition ?? 'unknown',
          observedAt: w.timestamp ?? new Date().toISOString(),
        };
        return row;
      });
      return rows.filter((r): r is StateWeather => r !== null);
    },
  });
}

export const HISTORY_CITIES = ['HH', 'BE', 'NW', 'HE', 'BY', 'SN'];
export const WEATHER_HORIZONS: Horizon[] = ['24h', '7d', '30d'];

export function getWeatherHistory(h: Horizon): Promise<FeedResult<CityWeatherHistory[]>> {
  const days = HORIZONS[h].days;
  return loadFeed<CityWeatherHistory[]>('weather_history', {
    key: `weather_history:${h}`,
    ttlMs: (h === '30d' ? 120 : 30) * MIN,
    empty: [],
    validate: (d) => d.length >= 3,
    simulate: () => simulateWeatherHistory(Date.now(), days, HISTORY_CITIES),
    live: async () => {
      const now = Date.now();
      const from = berlinDate(now - days * 86_400_000);
      const to = berlinDate(now + 86_400_000);
      const fromSec = now / 1000 - days * 86_400;
      const rows = await mapLimit(HISTORY_CITIES, 6, async (code) => {
        const s = STATE_BY_CODE[code];
        const raw = await fetchJson<{ weather?: BsHour[] }>(`${BS}/weather?lat=${s?.lat}&lon=${s?.lon}&date=${from}&last_date=${to}&tz=UTC`, { timeoutMs: 15_000 });
        const out: CityWeatherHistory = { code, city: s?.capital ?? code, t: [], temperature: [], wind: [], precipitation: [] };
        for (const w of raw?.weather ?? []) {
          const sec = Date.parse(w.timestamp ?? '') / 1000;
          if (!Number.isFinite(sec) || sec < fromSec || sec > now / 1000 || typeof w.temperature !== 'number') continue;
          out.t.push(sec);
          out.temperature.push(w.temperature);
          out.wind.push(n(w.wind_speed));
          out.precipitation.push(n(w.precipitation));
        }
        if (out.t.length < 6) throw new UpstreamError('no history');
        return out;
      });
      return rows.filter((r): r is CityWeatherHistory => r !== null);
    },
  });
}

const SEVERITIES: AlertSeverity[] = ['minor', 'moderate', 'severe', 'extreme'];

export function getWeatherAlerts(): Promise<FeedResult<WeatherAlert[]>> {
  return loadFeed<WeatherAlert[]>('weather_alerts', {
    empty: [],
    simulate: () => simulateAlerts(Date.now()),
    live: async () => {
      const raw = await fetchJson<{ alerts?: BsAlert[] }>(`${BS}/alerts`, { timeoutMs: 12_000 });
      if (!Array.isArray(raw?.alerts)) throw new UpstreamError('malformed alerts payload');
      return raw.alerts.slice(0, 600).map((a): WeatherAlert => {
        const cells = a.warn_cell_ids ?? [];
        const states = new Set<string>();
        for (const c of cells) {
          const code = STATE_BY_AGS[String(c).padStart(9, '0').slice(1, 3)]?.code;
          if (code) states.add(code);
        }
        const sev = (a.severity ?? 'minor').toLowerCase() as AlertSeverity;
        return {
          id: String(a.id ?? ''),
          event: a.event_en ?? a.event_de ?? 'weather warning',
          headline: a.headline_en ?? a.headline_de ?? 'Official weather warning',
          severity: SEVERITIES.includes(sev) ? sev : 'minor',
          urgency: a.urgency ?? 'unknown',
          onset: a.onset ?? a.effective ?? new Date().toISOString(),
          expires: a.expires ?? null,
          states: [...states],
          cells: cells.length,
          description: (a.description_en ?? '').slice(0, 280),
        };
      });
    },
  });
}

interface NinaItem { id?: string; startDate?: string; severity?: string; type?: string; i18nTitle?: { de?: string; en?: string } }
const NINA_PROVIDERS: [string, string][] = [['mowas', 'MoWaS'], ['katwarn', 'KATWARN'], ['biwapp', 'BIWAPP'], ['lhp', 'Hochwasserportal'], ['police', 'Polizei']];

export function getCivilWarnings(): Promise<FeedResult<CivilWarning[]>> {
  return loadFeed<CivilWarning[]>('civil_warnings', {
    empty: [],
    simulate: () => simulateCivilWarnings(Date.now()),
    live: async () => {
      let ok = 0;
      const lists = await mapLimit(NINA_PROVIDERS, 5, async ([path, label]) => {
        const raw = await fetchJson<NinaItem[]>(`https://warnung.bund.de/api31/${path}/mapData.json`, { timeoutMs: 8_000 });
        if (!Array.isArray(raw)) throw new UpstreamError('malformed');
        ok++;
        return raw.map((w): CivilWarning => {
          const m = /DE-([A-Z]{2})/.exec(w.id ?? '');
          return {
            id: w.id ?? '',
            provider: label,
            title: w.i18nTitle?.en ?? w.i18nTitle?.de ?? 'Warning',
            severity: w.severity ?? 'Unknown',
            type: w.type ?? 'Alert',
            startDate: w.startDate ?? new Date().toISOString(),
            state: m && STATE_BY_CODE[m[1]] ? m[1] : null,
          };
        });
      });
      if (ok === 0) throw new UpstreamError('all NINA providers failed');
      return lists.flatMap((l) => l ?? []);
    },
  });
}
