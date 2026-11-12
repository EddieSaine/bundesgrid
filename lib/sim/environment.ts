/** Simulators for weather, warnings, rivers and air quality. Deterministic in time. */
import type {
  AirHistory, AirStation, AlertSeverity, CityWeatherHistory, CivilWarning, Gauge, GaugeHistory, GaugeStatus, StateWeather, WeatherAlert,
} from '@/lib/domain/types';
import { CLIMATE_NORMALS } from '@/lib/data/national';
import { STATES, STATE_BY_CODE } from '@/lib/data/states';
import { clamp, fbm, hash01, strSeed } from '@/lib/sim/noise';
import { berlinHour, berlinParts, dayOfYear } from '@/lib/time';

const HOUR = 3600;
const S = (k: string) => strSeed(`env:${k}`);

function normalTemp(ms: number): number {
  const p = berlinParts(ms);
  const a = CLIMATE_NORMALS[(p.month + 11) % 12]?.temperature ?? 9;
  const b = CLIMATE_NORMALS[p.month % 12]?.temperature ?? 9;
  const prev = CLIMATE_NORMALS[(p.month + 10) % 12]?.temperature ?? 9;
  // Normals describe the middle of the month: blend towards the neighbouring month.
  const f = (p.day - 15) / 30;
  return f >= 0 ? a + (b - a) * f : a + (prev - a) * -f;
}

function weatherAt(code: string, sec: number) {
  const s = STATE_BY_CODE[code];
  const ms = sec * 1000;
  const h = berlinHour(ms);
  const lat = s?.lat ?? 51;
  const lon = s?.lon ?? 10;
  const front = fbm(S('front'), sec / (HOUR * 40) - lon / 14); // weather systems travel west → east
  const cloud = clamp(62 + 38 * fbm(S('cloud'), sec / (HOUR * 10) - lon / 9), 0, 100);
  const diurnal = -Math.cos(((h - 3) / 24) * 2 * Math.PI) * (2 + 3.2 * (1 - cloud / 100));
  const temperature = normalTemp(ms) + (50.5 - lat) * 0.55 + (lon - 10) * -0.12 + diurnal + 4.5 * front + 0.8 * fbm(S(`t:${code}`), sec / (HOUR * 5));
  const coastal = lat > 53 ? 6 : 0;
  const windSpeed = clamp(13 + coastal + 11 * fbm(S('wind'), sec / (HOUR * 22) - lon / 12) + 3 * fbm(S(`w:${code}`), sec / (HOUR * 2)), 1, 75);
  const rainDrive = fbm(S('rain'), sec / (HOUR * 7) - lon / 8) + (cloud - 70) / 90;
  const precipitation = rainDrive > 0.42 ? (rainDrive - 0.42) * 6.5 : 0;
  return { temperature, windSpeed, cloud, precipitation, pressure: 1014 - 9 * front + (lat - 51) * -0.4 };
}

function conditionOf(cloud: number, rain: number, temp: number, h: number): string {
  if (rain > 0.05) return temp < 0.5 ? 'snow' : 'rain';
  if (cloud > 85) return 'cloudy';
  if (cloud > 45) return h > 7 && h < 18 ? 'partly-cloudy-day' : 'partly-cloudy-night';
  return h > 7 && h < 18 ? 'clear-day' : 'clear-night';
}

export function simulateWeather(nowMs: number): StateWeather[] {
  const sec = Math.floor(nowMs / 1000 / 600) * 600;
  const h = berlinHour(nowMs);
  return STATES.map((s) => {
    const w = weatherAt(s.code, sec);
    return {
      code: s.code,
      name: s.name,
      capital: s.capital,
      station: `${s.capital} (model)`,
      temperature: Math.round(w.temperature * 10) / 10,
      windSpeed: Math.round(w.windSpeed * 10) / 10,
      windGust: Math.round(w.windSpeed * 1.65 * 10) / 10,
      windDirection: Math.round(clamp(245 + 70 * fbm(S(`dir:${s.code}`), sec / (HOUR * 16)), 0, 359)),
      precipitation60: Math.round(w.precipitation * 10) / 10,
      humidity: Math.round(clamp(58 + w.cloud * 0.32 + (w.precipitation > 0 ? 8 : 0), 30, 100)),
      pressure: Math.round(w.pressure * 10) / 10,
      cloudCover: Math.round(w.cloud),
      sunshine60: h > 8 && h < 17 ? Math.round(60 * (1 - w.cloud / 100)) : 0,
      visibility: Math.round(clamp(42_000 - w.cloud * 260 - w.precipitation * 9_000, 400, 50_000)),
      condition: conditionOf(w.cloud, w.precipitation, w.temperature, h),
      observedAt: new Date(sec * 1000).toISOString(),
    };
  });
}

export function simulateWeatherHistory(nowMs: number, days: number, codes: string[]): CityWeatherHistory[] {
  const end = Math.floor(nowMs / 1000 / HOUR) * HOUR;
  const t: number[] = [];
  for (let s = end - days * 86_400; s <= end; s += HOUR) t.push(s);
  return codes.map((code) => {
    const pts = t.map((s) => weatherAt(code, s));
    return {
      code,
      city: STATE_BY_CODE[code]?.capital ?? code,
      t,
      temperature: pts.map((p) => Math.round(p.temperature * 10) / 10),
      wind: pts.map((p) => Math.round(p.windSpeed * 10) / 10),
      precipitation: pts.map((p) => Math.round(p.precipitation * 10) / 10),
    };
  });
}

const ALERT_EVENTS: [string, AlertSeverity][] = [
  ['wind gusts', 'minor'], ['fog', 'minor'], ['frost', 'minor'], ['persistent rain', 'moderate'],
  ['gale-force gusts', 'moderate'], ['heavy rain', 'severe'], ['black ice', 'moderate'], ['snowfall', 'minor'],
];

export function simulateAlerts(nowMs: number): WeatherAlert[] {
  const slot = Math.floor(nowMs / (3 * HOUR * 1000));
  const out: WeatherAlert[] = [];
  STATES.forEach((s, i) => {
    const r = hash01(slot * 31 + i, S('alert'));
    if (r > 0.34) return;
    const [event, severity] = ALERT_EVENTS[Math.floor(hash01(slot + i * 7, S('alertKind')) * ALERT_EVENTS.length)] ?? ALERT_EVENTS[0];
    const onset = slot * 3 * HOUR * 1000 - Math.floor(r * 4 * HOUR * 1000);
    out.push({
      id: `sim-${slot}-${s.code}`,
      event,
      headline: `Official warning of ${event} (modelled)`,
      severity,
      urgency: 'immediate',
      onset: new Date(onset).toISOString(),
      expires: new Date(onset + 9 * HOUR * 1000).toISOString(),
      states: [s.code],
      cells: 2 + Math.floor(r * 40),
      description: `Simulated ${event} warning for parts of ${s.name}.`,
    });
  });
  return out;
}

export function simulateCivilWarnings(nowMs: number): CivilWarning[] {
  const slot = Math.floor(nowMs / (6 * HOUR * 1000));
  const kinds = ['Large fire: keep windows closed', 'Drinking water advisory', 'Unexploded ordnance disposal', 'Power outage', 'Emergency number disruption'];
  const out: CivilWarning[] = [];
  STATES.forEach((s, i) => {
    const r = hash01(slot * 17 + i, S('civil'));
    if (r > 0.2) return;
    out.push({
      id: `sim.DE-${s.code}-${slot}`,
      provider: 'MoWaS (modelled)',
      title: `${kinds[Math.floor(r * 25) % kinds.length]} (${s.capital} area)`,
      severity: r < 0.05 ? 'Severe' : 'Minor',
      type: 'Alert',
      startDate: new Date(slot * 6 * HOUR * 1000).toISOString(),
      state: s.code,
    });
  });
  return out;
}

// ---------- rivers ----------
export interface GaugeSpec {
  name: string;
  water: string;
  km: number;
  lat: number;
  lon: number;
  state: string;
  mw: number;
  mnw: number;
  mhw: number;
  hsw: number | null;
}

/** Key shipping gauges with approximate long-term characteristic levels (cm) for the simulator. */
export const GAUGE_SPECS: GaugeSpec[] = [
  { name: 'MAXAU', water: 'RHEIN', km: 362.3, lat: 49.04, lon: 8.31, state: 'BW', mw: 515, mnw: 360, mhw: 790, hsw: 750 },
  { name: 'MAINZ', water: 'RHEIN', km: 498.3, lat: 50.0, lon: 8.28, state: 'RP', mw: 300, mnw: 170, mhw: 580, hsw: 630 },
  { name: 'KAUB', water: 'RHEIN', km: 546.3, lat: 50.09, lon: 7.76, state: 'RP', mw: 224, mnw: 80, mhw: 560, hsw: 640 },
  { name: 'KOBLENZ', water: 'RHEIN', km: 591.5, lat: 50.36, lon: 7.6, state: 'RP', mw: 235, mnw: 85, mhw: 590, hsw: 650 },
  { name: 'KÖLN', water: 'RHEIN', km: 688.0, lat: 50.94, lon: 6.96, state: 'NW', mw: 321, mnw: 140, mhw: 760, hsw: 830 },
  { name: 'DUISBURG-RUHRORT', water: 'RHEIN', km: 780.8, lat: 51.46, lon: 6.73, state: 'NW', mw: 398, mnw: 215, mhw: 870, hsw: 1130 },
  { name: 'DRESDEN', water: 'ELBE', km: 55.6, lat: 51.05, lon: 13.74, state: 'SN', mw: 190, mnw: 75, mhw: 530, hsw: 500 },
  { name: 'MAGDEBURG-STROMBRÜCKE', water: 'ELBE', km: 326.6, lat: 52.13, lon: 11.64, state: 'ST', mw: 205, mnw: 80, mhw: 490, hsw: 590 },
  { name: 'PASSAU DONAU', water: 'DONAU', km: 2226.7, lat: 48.58, lon: 13.47, state: 'BY', mw: 470, mnw: 400, mhw: 750, hsw: 780 },
  { name: 'REGENSBURG EISERNE BRÜCKE', water: 'DONAU', km: 2379.3, lat: 49.02, lon: 12.1, state: 'BY', mw: 250, mnw: 195, mhw: 480, hsw: 420 },
  { name: 'WÜRZBURG', water: 'MAIN', km: 251.9, lat: 49.79, lon: 9.93, state: 'BY', mw: 165, mnw: 130, mhw: 440, hsw: 370 },
  { name: 'FRANKFURT OSTHAFEN', water: 'MAIN', km: 37.6, lat: 50.11, lon: 8.7, state: 'HE', mw: 175, mnw: 150, mhw: 390, hsw: 370 },
  { name: 'TRIER UP', water: 'MOSEL', km: 195.3, lat: 49.73, lon: 6.62, state: 'RP', mw: 320, mnw: 270, mhw: 800, hsw: 695 },
  { name: 'HANN.MUENDEN', water: 'WESER', km: 0.6, lat: 51.42, lon: 9.64, state: 'NI', mw: 165, mnw: 105, mhw: 430, hsw: 420 },
  { name: 'FRANKFURT1 (ODER)', water: 'ODER', km: 584.0, lat: 52.35, lon: 14.55, state: 'BB', mw: 215, mnw: 120, mhw: 430, hsw: 520 },
];

function levelAt(g: GaugeSpec, sec: number): number {
  const season = Math.cos(((dayOfYear(sec * 1000) - 60) / 365) * 2 * Math.PI); // high in late winter, low in early autumn
  const basin = fbm(S(`basin:${g.water}`), sec / (86_400 * 9) - g.km / 900);
  const local = fbm(S(`gauge:${g.name}`), sec / (86_400 * 2));
  const span = g.mhw - g.mnw;
  return Math.max(g.mnw * 0.45, g.mw - 0.05 * span + 0.13 * span * season + 0.3 * span * basin + 0.05 * span * local);
}

const gaugeStatus = (level: number, g: GaugeSpec): GaugeStatus => (level <= g.mnw ? 'low' : level >= g.mhw ? 'high' : 'normal');

export function simulateGauges(nowMs: number): Gauge[] {
  const sec = Math.floor(nowMs / 1000 / 900) * 900;
  return GAUGE_SPECS.map((g) => {
    const level = Math.round(levelAt(g, sec));
    return {
      id: `sim-${g.name}`,
      name: g.name,
      water: g.water,
      km: g.km,
      lat: g.lat,
      lon: g.lon,
      state: g.state,
      levelCm: level,
      observedAt: new Date(sec * 1000).toISOString(),
      dischargeM3s: null,
      meanWaterCm: g.mw,
      meanLowCm: g.mnw,
      meanHighCm: g.mhw,
      highestNavigableCm: g.hsw,
      status: gaugeStatus(level, g),
    };
  });
}

export function simulateGaugeHistory(nowMs: number, days: number, bucketSec: number, names: string[]): GaugeHistory[] {
  const end = Math.floor(nowMs / 1000 / bucketSec) * bucketSec;
  const t: number[] = [];
  for (let s = end - days * 86_400; s <= end; s += bucketSec) t.push(s);
  return names.map((name) => {
    const g = GAUGE_SPECS.find((x) => x.name === name) ?? GAUGE_SPECS[0];
    return { name, water: g.water, t, levelCm: t.map((s) => Math.round(levelAt(g, s))) };
  });
}

// ---------- air ----------
const AIR_SETTINGS: [string, string, number][] = [
  ['urban', 'traffic', 1.45], ['urban', 'background', 1], ['suburban', 'background', 0.85], ['rural', 'background', 0.6],
];

function airAt(sec: number, lon: number, factor: number, key: string) {
  const h = berlinHour(sec * 1000);
  const season = Math.cos(((dayOfYear(sec * 1000) - 172) / 365) * 2 * Math.PI);
  const rush = Math.exp(-((h - 8) ** 2) / 5) + Math.exp(-((h - 18) ** 2) / 6);
  const stagnation = 0.5 + 0.5 * fbm(S('stagnation'), sec / (HOUR * 30) - lon / 12);
  const jitter = 1 + 0.18 * fbm(S(`air:${key}`), sec / (HOUR * 4));
  const no2 = (9 + 17 * rush * factor + 8 * stagnation) * factor * jitter;
  const pm10 = (11 + 5 * rush * factor + 16 * stagnation - 3 * season) * (0.7 + 0.3 * factor) * jitter;
  const pm25 = pm10 * (0.62 - 0.08 * season);
  const o3 = clamp((38 + 34 * season) * (0.5 + 0.7 * Math.exp(-((h - 15) ** 2) / 14)) * (1.25 - 0.3 * factor) * jitter, 2, 190);
  return { no2, pm10, pm25, o3 };
}

const band = (v: number, edges: number[]): number => edges.filter((e) => v > e).length;
/** UBA Luftqualitätsindex: the worst pollutant class decides (0 very good … 4 very poor). */
export function lqi(pm10: number | null, pm25: number | null, no2: number | null, o3: number | null): number {
  return Math.max(
    pm10 === null ? 0 : band(pm10, [20, 35, 50, 100]),
    pm25 === null ? 0 : band(pm25, [10, 20, 25, 50]),
    no2 === null ? 0 : band(no2, [20, 40, 100, 200]),
    o3 === null ? 0 : band(o3, [60, 120, 180, 240]),
  );
}

export function simulateAirStations(nowMs: number): AirStation[] {
  const sec = Math.floor(nowMs / 1000 / HOUR) * HOUR;
  const out: AirStation[] = [];
  for (const s of STATES) {
    const n = s.cityState ? 4 : clamp(Math.round(s.population / 900), 5, 14);
    for (let i = 0; i < n; i++) {
      const [setting, type, factor] = AIR_SETTINGS[i % AIR_SETTINGS.length] ?? AIR_SETTINGS[1];
      const key = `${s.code}${i}`;
      const a = airAt(sec, s.lon, factor, key);
      out.push({
        id: `sim-${key}`,
        code: `DE${s.code}${String(i + 1).padStart(3, '0')}`,
        name: `${i === 0 ? s.capital : s.name} ${type === 'traffic' ? 'Verkehr' : setting} ${i + 1} (model)`,
        city: i < 2 ? s.capital : s.name,
        state: s.code,
        setting,
        type,
        lat: s.lat + (hash01(i, S(`lat:${s.code}`)) - 0.5) * 0.8,
        lon: s.lon + (hash01(i, S(`lon:${s.code}`)) - 0.5) * 0.8,
        index: lqi(a.pm10, a.pm25, a.no2, a.o3),
        pm10: Math.round(a.pm10),
        pm25: Math.round(a.pm25),
        no2: Math.round(a.no2),
        o3: Math.round(a.o3),
        observedAt: new Date(sec * 1000).toISOString(),
      });
    }
  }
  return out;
}

export function simulateAirHistory(nowMs: number): AirHistory {
  const end = Math.floor(nowMs / 1000 / HOUR) * HOUR;
  const h: AirHistory = { t: [], index: [], pm10: [], pm25: [], no2: [], o3: [], stations: [] };
  for (let s = end - 24 * HOUR; s <= end; s += HOUR) {
    const a = airAt(s, 10, 1, 'national');
    h.t.push(s);
    h.pm10.push(Math.round(a.pm10 * 10) / 10);
    h.pm25.push(Math.round(a.pm25 * 10) / 10);
    h.no2.push(Math.round(a.no2 * 10) / 10);
    h.o3.push(Math.round(a.o3 * 10) / 10);
    h.index.push(Math.round((0.6 + lqi(a.pm10, a.pm25, a.no2, a.o3) * 0.55) * 100) / 100);
    h.stations.push(380);
  }
  return h;
}
