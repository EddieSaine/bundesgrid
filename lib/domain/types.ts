/**
 * Domain schemas for the Deutschland-Dashboard.
 * Every feed is normalised into one of these shapes, whether it came from the live API or the simulator.
 */

// ---------- feeds & status ----------
export type FeedState = 'LIVE' | 'SIMULATED' | 'STALE' | 'ERROR';

export type FeedId =
  | 'energy_power'
  | 'energy_price'
  | 'energy_co2'
  | 'energy_flows'
  | 'smard_load'
  | 'weather_current'
  | 'weather_history'
  | 'weather_alerts'
  | 'civil_warnings'
  | 'autobahn'
  | 'water_levels'
  | 'water_history'
  | 'air_quality'
  | 'air_history'
  | 'fx_rates'
  | 'equity_indices'
  | 'inflation'
  | 'unemployment'
  | 'gdp'
  | 'ifo_index'
  | 'insolvencies'
  | 'rail';

export interface FeedDefinition {
  id: FeedId;
  name: string;
  provider: string;
  /** Human-facing documentation / homepage of the upstream source. */
  homepage: string;
  /** `live` feeds try a real API first; `simulated` feeds have no open API and are modelled by design. */
  kind: 'live' | 'simulated';
  /** How long a successful fetch is served from cache. */
  ttlMs: number;
  /** How long a last-good payload may be served as STALE before the simulator takes over. */
  staleMs: number;
  cadence: string;
  section: string;
}

export interface FeedResult<T> {
  feedId: FeedId;
  data: T;
  status: FeedState;
  /** ISO time the payload was obtained (or generated, for simulations). */
  updatedAt: string;
  latencyMs: number;
  error?: string;
}

export interface FeedStatus {
  feedId: FeedId;
  name: string;
  provider: string;
  homepage: string;
  kind: 'live' | 'simulated';
  section: string;
  cadence: string;
  status: FeedState;
  updatedAt: string | null;
  lastAttemptAt: string | null;
  latencyMs: number | null;
  error: string | null;
  consecutiveFailures: number;
  /** Recent upstream attempts (latency in ms, -1 = failed), oldest first. */
  recent: number[];
  /** Share of successful upstream attempts in the last 24 h (0..1), null when unknown. */
  uptime24h: number | null;
  checks24h: number;
}

// ---------- time ----------
export type Horizon = '24h' | '7d' | '30d' | '1y';

export interface TimeSeries {
  /** Epoch seconds. */
  t: number[];
  v: number[];
}

// ---------- energy ----------
export type GenerationKey =
  | 'solar'
  | 'windOnshore'
  | 'windOffshore'
  | 'biomass'
  | 'hydro'
  | 'gas'
  | 'hardCoal'
  | 'lignite'
  | 'other';

export interface PowerFrame {
  t: number[];
  /** Mean MW per bucket. */
  mw: Record<GenerationKey, number[]>;
  load: number[];
  residual: number[];
  /** Net import (+) / export (−) in MW. */
  crossBorder: number[];
  bucketSec: number;
}

export interface PriceFrame {
  /** Published day-ahead prices up to now (EUR/MWh). */
  history: TimeSeries;
  /** Already-published day-ahead prices for the coming hours. */
  ahead: TimeSeries;
  bucketSec: number;
}

export interface Co2Frame {
  actual: TimeSeries;
  forecast: TimeSeries;
}

export interface FlowFrame {
  t: number[];
  /** Net physical import (+) / export (−) per neighbour, GW. */
  countries: Record<string, number[]>;
  bucketSec: number;
}

// ---------- weather ----------
export interface StateWeather {
  code: string;
  name: string;
  capital: string;
  station: string;
  temperature: number;
  windSpeed: number;
  windGust: number;
  windDirection: number;
  precipitation60: number;
  humidity: number;
  pressure: number;
  cloudCover: number;
  sunshine60: number;
  visibility: number;
  condition: string;
  observedAt: string;
}

export interface CityWeatherHistory {
  code: string;
  city: string;
  t: number[];
  temperature: number[];
  wind: number[];
  precipitation: number[];
}

export type AlertSeverity = 'minor' | 'moderate' | 'severe' | 'extreme';

export interface WeatherAlert {
  id: string;
  event: string;
  headline: string;
  severity: AlertSeverity;
  urgency: string;
  onset: string;
  expires: string | null;
  states: string[];
  cells: number;
  description: string;
}

export interface CivilWarning {
  id: string;
  provider: string;
  title: string;
  severity: string;
  type: string;
  startDate: string;
  state: string | null;
}

// ---------- mobility ----------
export type TrafficKind = 'roadworks' | 'closure' | 'warning';

export interface TrafficEvent {
  id: string;
  road: string;
  kind: TrafficKind;
  title: string;
  subtitle: string;
  blocked: boolean;
  future: boolean;
  displayType: string;
  lengthKm: number | null;
  lat: number;
  lon: number;
  state: string | null;
}

export interface TrafficSnapshot {
  roads: string[];
  events: TrafficEvent[];
}

export interface RailHub {
  station: string;
  state: string;
  punctuality: number;
  avgDelayMin: number;
  departuresPerHour: number;
  cancelled: number;
}

export interface RailLine {
  line: string;
  route: string;
  category: 'ICE' | 'IC' | 'RE' | 'S-Bahn';
  punctuality: number;
  avgDelayMin: number;
}

export interface RailSnapshot {
  longDistancePunctuality: number;
  regionalPunctuality: number;
  cancellationRate: number;
  avgDelayMin: number;
  trainsRunning: number;
  hubs: RailHub[];
  lines: RailLine[];
  hourly: { t: number; longDistance: number; regional: number }[];
  causes: { cause: string; share: number }[];
}

// ---------- rivers ----------
export type GaugeStatus = 'low' | 'normal' | 'high' | 'unknown';

export interface Gauge {
  id: string;
  name: string;
  water: string;
  km: number;
  lat: number;
  lon: number;
  state: string | null;
  levelCm: number;
  observedAt: string;
  dischargeM3s: number | null;
  meanWaterCm: number | null;
  meanLowCm: number | null;
  meanHighCm: number | null;
  highestNavigableCm: number | null;
  status: GaugeStatus;
}

export interface GaugeHistory {
  name: string;
  water: string;
  t: number[];
  levelCm: number[];
}

// ---------- air ----------
export interface AirStation {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  setting: string;
  type: string;
  lat: number;
  lon: number;
  /** UBA Luftqualitätsindex 0 (very good) .. 4 (very poor). */
  index: number;
  pm10: number | null;
  pm25: number | null;
  no2: number | null;
  o3: number | null;
  observedAt: string;
}

export interface AirHistory {
  t: number[];
  index: number[];
  pm10: number[];
  pm25: number[];
  no2: number[];
  o3: number[];
  stations: number[];
}

// ---------- economy ----------
export interface FxSnapshot {
  date: string;
  rates: Record<string, number>;
  previous: Record<string, number>;
  dates: string[];
  series: Record<string, number[]>;
}

export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  dayHigh: number;
  dayLow: number;
  t: number[];
  close: number[];
}

export interface PeriodSeries {
  /** `YYYY-MM` or `YYYY-Qn`. */
  periods: string[];
  values: number[];
  unit: string;
}

// ---------- Bundesländer ----------
export type Region = 'West' | 'East';

export interface StateGovernment {
  head: string;
  headParty: string;
  parties: string[];
  nextElection: number;
  bundesratVotes: number;
}

export interface StateProfile {
  code: string;
  ags: string;
  name: string;
  capital: string;
  lat: number;
  lon: number;
  region: Region;
  cityState: boolean;
  /** Thousand inhabitants. */
  population: number;
  areaKm2: number;
  gdpBn: number;
  unemployment: number;
  avgAge: number;
  foreignShare: number;
  rentEurM2: number;
  fiberShare: number;
  hospitalBedsPer100k: number;
  overnightStaysM: number;
  debtPerCapita: number;
  renewableShare: number;
  windMw: number;
  solarMwp: number;
  government: StateGovernment;
}

export interface StateMetricDef {
  id: string;
  label: string;
  unit: string;
  decimals: number;
  group: string;
  source: string;
  live: boolean;
  /** null = neutral (no better/worse direction). */
  higherIsBetter: boolean | null;
}

export interface StateRow extends Record<string, string | number | null> {
  code: string;
  name: string;
}

// ---------- ticker / stream ----------
export interface TickerItem {
  id: string;
  label: string;
  value: number;
  display: string;
  unit: string;
  /** Relative change (fraction) versus the reference named in `deltaLabel`, null when not applicable. */
  delta: number | null;
  deltaLabel: string;
  goodWhen: 'up' | 'down' | 'neutral';
  status: FeedState;
  href: string;
}

export interface StreamPayload {
  ts: string;
  ticker: TickerItem[];
  feeds: FeedStatus[];
}
