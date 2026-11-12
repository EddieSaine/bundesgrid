/**
 * View builders: each returns a dashboard manifest (kit schema) plus the rows behind every tile and the
 * feed results that produced them. Server-only.
 */
import type { FeedResult, Horizon, StateRow, TickerItem } from '@/lib/domain/types';
import * as N from '@/lib/data/national';
import { STATES, STATE_BY_CODE, staticMetrics, stateName } from '@/lib/data/states';
import { getAirHistory, getAirStations } from '@/lib/feeds/air';
import { FX_HORIZONS, getFx, getGdp, getIfo, getIndices, getInflation, getInsolvencies, getUnemployment } from '@/lib/feeds/economy';
import { GENERATION_KEYS, getCo2, getFlows, getPower, getPrice, getSmardLoad } from '@/lib/feeds/energy';
import { getRail, getTraffic } from '@/lib/feeds/mobility';
import { getGaugeHistory, getGauges, KEY_GAUGES, RIVER_HORIZONS } from '@/lib/feeds/rivers';
import { getCivilWarnings, getWeatherAlerts, getWeatherHistory, getWeatherNow, WEATHER_HORIZONS } from '@/lib/feeds/weather';
import { axisLabel, clampHorizon, dateTimeLabel, HORIZONS, last, mean, monthLabel, rel, round, sparkOf } from '@/lib/time';

type Row = Record<string, unknown>;
type Rows = Row[];
export interface ViewOut {
  manifest: Record<string, unknown>;
  data: Record<string, Rows>;
  results: FeedResult<unknown>[];
  horizon: Horizon | null;
}

const GEN_LABEL: Record<string, string> = {
  solar: 'Solar', windOnshore: 'Wind onshore', windOffshore: 'Wind offshore', biomass: 'Biomass', hydro: 'Hydro',
  gas: 'Gas', hardCoal: 'Hard coal', lignite: 'Lignite', other: 'Other',
};
const RENEWABLE = ['solar', 'windOnshore', 'windOffshore', 'biomass', 'hydro'] as const;

const kpi = (label: string, value: number, format: string, extra: Row = {}): Rows => [{ label, value, format, ...extra }];
const kt = (id: string, accent?: string): Row => ({ id, type: 'kpi', span: 3, data: id, ...(accent ? { accent } : {}) });
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const gaugeName = (s: string) => s.split(/([ \-.(])/).map(title).join('');
const cut = <T,>(a: T[], n: number): T[] => (a.length > n ? a.slice(a.length - n) : a);
const srcs = (...l: [string, string][]) => l.map(([id, label]) => ({ id, label }));
const CUR = srcs(['curated', N.CURATED_NOTE]);

function manifest(titleText: string, eyebrow: string, subtitle: string, sources: { id: string; label: string }[], tiles: Row[], extra: Row = {}): Record<string, unknown> {
  return { title: titleText, eyebrow, subtitle, theme: 'midnight', sources, tiles, ...extra };
}

function renShare(mw: Record<string, number[]>, i: number): number {
  let ren = 0;
  let tot = 0;
  for (const k of GENERATION_KEYS) {
    const v = mw[k]?.[i] ?? 0;
    tot += v;
    if ((RENEWABLE as readonly string[]).includes(k)) ren += v;
  }
  return tot > 0 ? ren / tot : 0;
}

// ---------------------------------------------------------------- energy
async function energy(h: Horizon): Promise<ViewOut> {
  const [power, price, co2, flows, smard] = await Promise.all([getPower(h), getPrice(h), getCo2(), getFlows(h), getSmardLoad()]);
  const { days, label } = HORIZONS[h];
  const p = power.data;
  const i = p.t.length - 1;
  const lbl = (s: number, b: number) => axisLabel(s, b, days);
  const shares = p.t.map((_, j) => renShare(p.mw, j));
  const loadGw = (p.load[i] ?? 0) / 1000;
  const pr = price.data.history.v;
  const priceNow = last(pr) ?? 0;
  const co2Now = last(co2.data.actual.v) ?? 0;
  const net = Object.values(flows.data.countries).reduce((s, a) => s + (last(a) ?? 0), 0);
  const smardNow = (last(smard.data.v) ?? 0) / 1000;
  const data: Record<string, Rows> = {
    k_load: kpi('Grid load · GW', round(loadGw, 1), 'number', { delta: rel(loadGw, (p.load[0] ?? 0) / 1000), delta_label: `vs ${label} ago`, spark: sparkOf(p.load.map((v) => v / 1000)) }),
    k_ren: kpi('Renewable share of generation', round(shares[i] ?? 0, 3), 'percent', { delta: (shares[i] ?? 0) - (shares[0] ?? 0), delta_label: `vs ${label} ago`, spark: sparkOf(shares), good_when: 'up' }),
    k_price: kpi('Day-ahead price · €/MWh', round(priceNow, 1), 'number', { delta: rel(priceNow, mean(pr)), delta_label: `vs ${label} mean`, spark: sparkOf(pr), good_when: 'down' }),
    k_co2: kpi('CO₂ intensity · g/kWh', Math.round(co2Now), 'integer', { delta: rel(co2Now, co2.data.actual.v[0]), delta_label: 'vs start of series', spark: sparkOf(co2.data.actual.v), good_when: 'down' }),
    mix: p.t.map((s, j) => {
      const r: Row = { x: lbl(s, p.bucketSec) };
      for (const k of GENERATION_KEYS) r[k] = round((p.mw[k]?.[j] ?? 0) / 1000, 2);
      return r;
    }),
    mix_now: GENERATION_KEYS.map((k) => ({ source: GEN_LABEL[k], gw: round((p.mw[k]?.[i] ?? 0) / 1000, 1) })),
    price: [
      ...price.data.history.t.map((s, j) => ({ x: lbl(s, price.data.bucketSec), price: pr[j] })),
      ...(h === '24h' ? price.data.ahead.t.map((s, j) => ({ x: lbl(s, 3600), ahead: price.data.ahead.v[j] })) : []),
    ],
    flows: Object.entries(flows.data.countries).map(([country, a]) => ({ country, gw: round(last(a) ?? 0, 2), direction: (last(a) ?? 0) >= 0 ? 'Import' : 'Export' })),
    load: p.t.map((s, j) => ({ x: lbl(s, p.bucketSec), load: round((p.load[j] ?? 0) / 1000, 2), residual: round((p.residual[j] ?? 0) / 1000, 2) })),
    co2: [
      ...cut(co2.data.actual.t, 96).map((s, j, a) => ({ x: axisLabel(s, 900, 1), actual: cut(co2.data.actual.v, 96)[j], n: a.length })),
      ...co2.data.forecast.t.slice(0, 48).map((s, j) => ({ x: axisLabel(s, 900, 1), forecast: co2.data.forecast.v[j] })),
    ],
    capacity: N.INSTALLED_CAPACITY.map((c) => ({ source: c.source, gw: c.gw, kind: c.kind })),
    crosscheck: [
      { source: 'Energy-Charts (Fraunhofer ISE)', value: round(loadGw, 1), cadence: '15 min', status: power.status },
      { source: 'SMARD (Bundesnetzagentur)', value: round(smardNow, 1), cadence: 'hourly, published with delay', status: smard.status },
    ],
  };
  const tiles: Row[] = [
    kt('k_load'), kt('k_ren', 'pos'), kt('k_price'), kt('k_co2'),
    { id: 'mix', type: 'area', span: 8, data: 'mix', x: 'x', stacked: true, unit: 'GW', title: 'Net public generation by source', subtitle: `${HORIZONS[h].long} · GW`, insight: `Renewables supply ${Math.round((shares[i] ?? 0) * 100)}% of generation right now; ${GEN_LABEL[[...GENERATION_KEYS].sort((a, b) => (p.mw[b]?.[i] ?? 0) - (p.mw[a]?.[i] ?? 0))[0]]} is the largest single source.`, series: GENERATION_KEYS.map((k) => ({ field: k, label: GEN_LABEL[k] })), source: 'ec', query: 'GET api.energy-charts.info/public_power?country=de' },
    { id: 'mix_now', type: 'bar', span: 4, data: 'mix_now', category: 'source', value: 'gw', sort: 'desc', signed: false, unit: 'GW', title: 'Generation right now', subtitle: 'Latest interval · GW', insight: 'The current stack, largest source first.', source: 'ec' },
    { id: 'price', type: 'area', span: 6, data: 'price', x: 'x', unit: '€/MWh', title: 'Day-ahead price, DE-LU bidding zone', subtitle: `${HORIZONS[h].long}${h === '24h' ? ' plus already-auctioned hours ahead' : ''}`, insight: `Power clears at ${round(priceNow, 0)} €/MWh against a ${label} mean of ${round(mean(pr), 0)} €/MWh.`, series: [{ field: 'price', label: 'Day-ahead' }, ...(h === '24h' ? [{ field: 'ahead', label: 'Auctioned ahead' }] : [])], source: 'ec', query: 'GET api.energy-charts.info/price?bzn=DE-LU' },
    { id: 'flows', type: 'lollipop', span: 6, data: 'flows', category: 'country', value: 'gw', color: 'direction', unit: 'GW', title: 'Cross-border physical flows', subtitle: 'Latest interval · positive = import into Germany', insight: `Germany is a net ${net >= 0 ? 'importer' : 'exporter'} of ${round(Math.abs(net), 1)} GW across its ${Object.keys(flows.data.countries).length} borders.`, source: 'ec', query: 'GET api.energy-charts.info/cbet?country=de' },
    { id: 'load', type: 'area', span: 6, data: 'load', x: 'x', unit: 'GW', end_values: true, title: 'Load versus residual load', subtitle: 'Residual = load minus wind and solar', insight: `Conventional plants and imports must cover ${round((p.residual[i] ?? 0) / 1000, 1)} GW of the ${round(loadGw, 1)} GW load.`, series: [{ field: 'load', label: 'Load' }, { field: 'residual', label: 'Residual load' }], source: 'ec' },
    { id: 'co2', type: 'area', span: 6, data: 'co2', x: 'x', unit: 'g/kWh', title: 'Grid CO₂ intensity, actual and forecast', subtitle: 'Last 24 h and the hours ahead · g CO₂eq per kWh', insight: `Each kWh currently carries about ${Math.round(co2Now)} g CO₂eq.`, series: [{ field: 'actual', label: 'Actual' }, { field: 'forecast', label: 'Forecast' }], source: 'ec', query: 'GET api.energy-charts.info/co2eq?country=de' },
    { id: 'capacity', type: 'bar', span: 6, data: 'capacity', category: 'source', value: 'gw', sort: 'desc', signed: false, unit: 'GW', title: 'Installed capacity', subtitle: 'End of 2024 · GW · curated', insight: 'Solar and onshore wind are the two largest fleets by capacity.', source: 'curated' },
    { id: 'crosscheck', type: 'table', span: 6, data: 'crosscheck', title: 'Load cross-check between two sources', subtitle: 'Latest published value per source · GW', insight: 'Two independent publishers of grid load; SMARD lags by design.', columns: [{ field: 'source', label: 'Source' }, { field: 'value', label: 'Load GW', format: 'number' }, { field: 'cadence', label: 'Cadence' }, { field: 'status', label: 'Feed', format: 'status' }], source: 'smard' },
  ];
  return {
    manifest: manifest(`Germany draws ${round(loadGw, 1)} GW and renewables cover ${Math.round((shares[i] ?? 0) * 100)}% of generation`, `Energy grid · ${HORIZONS[h].long}`, 'Generation, load, wholesale price, carbon intensity and cross-border exchange of the German power system.', [...srcs(['ec', 'Energy-Charts · Fraunhofer ISE'], ['smard', 'SMARD · Bundesnetzagentur']), ...CUR], tiles, { colors: { Solar: 'accent', 'Wind onshore': 'pos', 'Wind offshore': 'accent-2', Lignite: 'neg', Import: 'accent', Export: 'pos' } }),
    data,
    results: [power, price, co2, flows, smard],
    horizon: h,
  };
}

// ---------------------------------------------------------------- weather
async function weather(h0: Horizon, state: string | null): Promise<ViewOut> {
  const h = clampHorizon(h0, WEATHER_HORIZONS);
  const [now, alerts, civil, hist] = await Promise.all([getWeatherNow(), getWeatherAlerts(), getCivilWarnings(), getWeatherHistory(h)]);
  const w = now.data;
  const temps = w.map((x) => x.temperature);
  const warm = [...w].sort((a, b) => b.temperature - a.temperature)[0];
  const cold = [...w].sort((a, b) => a.temperature - b.temperature)[0];
  const gust = [...w].sort((a, b) => b.windGust - a.windGust)[0];
  const b = h === '24h' ? 3600 : h === '7d' ? 10_800 : 86_400;
  const base = hist.data[0];
  const seen = new Map<number, Row>();
  for (const c of hist.data) {
    c.t.forEach((s, j) => {
      const key = Math.floor(s / b) * b;
      const r = seen.get(key) ?? { x: axisLabel(key, b, HORIZONS[h].days), _n: {} as Record<string, number> };
      const cnt = r._n as Record<string, number>;
      r[c.city] = ((r[c.city] as number | undefined) ?? 0) + (c.temperature[j] ?? 0);
      cnt[c.city] = (cnt[c.city] ?? 0) + 1;
      seen.set(key, r);
    });
  }
  const history = [...seen.entries()].sort((a, c) => a[0] - c[0]).map(([, r]) => {
    const cnt = r._n as Record<string, number>;
    const out: Row = { x: r.x };
    for (const c of hist.data) if (cnt[c.city]) out[c.city] = round((r[c.city] as number) / cnt[c.city], 1);
    return out;
  });
  const pick = <T extends { states?: string[]; state?: string | null }>(l: T[]) => (state ? l.filter((x) => x.states?.includes(state) || x.state === state) : l);
  const al = pick(alerts.data);
  const cv = pick(civil.data);
  const data: Record<string, Rows> = {
    k_temp: kpi('Mean temperature, 16 capitals · °C', round(mean(temps), 1), 'number', { spark: sparkOf(base?.temperature ?? []), delta_label: `spark: ${base?.city ?? ''}` }),
    k_gust: kpi(`Strongest gusts · km/h · ${gust?.capital ?? ''}`, Math.round(gust?.windGust ?? 0), 'integer', {}),
    k_alerts: kpi('Active DWD weather warnings', al.length, 'integer', { good_when: 'down' }),
    k_civil: kpi('Civil protection warnings (NINA)', cv.length, 'integer', { good_when: 'down' }),
    history,
    temps: w.map((x) => ({ state: x.name, temperature: x.temperature })),
    states: w.filter((x) => !state || x.code === state).map((x) => ({ state: x.name, station: x.station, temperature: x.temperature, wind: x.windSpeed, gust: x.windGust, rain: x.precipitation60, humidity: x.humidity, pressure: Math.round(x.pressure), cloud: x.cloudCover, condition: x.condition.replace(/-/g, ' '), region: STATE_BY_CODE[x.code]?.region ?? '' })),
    alerts: al.slice(0, 300).map((a) => ({ severity: a.severity, event: title(a.event), states: a.states.map((c) => c).join(', ') || '—', cells: a.cells, onset: dateTimeLabel(a.onset), expires: dateTimeLabel(a.expires) })),
    civil: cv.slice(0, 300).map((c) => ({ provider: c.provider, warning: c.title, severity: c.severity, state: stateName(c.state), since: dateTimeLabel(c.startDate) })),
    climate: N.ANNUAL_TEMPERATURE.map((y) => ({ x: y.year, temperature: y.temperature })),
    normals: N.CLIMATE_NORMALS.map((m) => ({ x: m.month, precipitation: m.precipitation, sunshine: m.sunshine })),
  };
  const tiles: Row[] = [
    kt('k_temp'), kt('k_gust'), kt('k_alerts', al.length ? 'neg' : 'pos'), kt('k_civil'),
    { id: 'history', type: 'area', span: 8, data: 'history', x: 'x', unit: '°C', end_values: true, title: 'Air temperature in six major cities', subtitle: `${HORIZONS[h].long} · °C · DWD stations`, insight: `${warm?.capital ?? ''} is warmest at ${round(warm?.temperature ?? 0, 1)} °C, ${cold?.capital ?? ''} coldest at ${round(cold?.temperature ?? 0, 1)} °C.`, series: hist.data.map((c) => ({ field: c.city, label: c.city })), source: 'bs', query: 'GET api.brightsky.dev/weather?lat&lon&date&last_date' },
    { id: 'temps', type: 'bar', span: 4, data: 'temps', category: 'state', value: 'temperature', sort: 'desc', signed: false, unit: '°C', title: 'Temperature by Bundesland', subtitle: 'State capital, latest observation', insight: `A spread of ${round((warm?.temperature ?? 0) - (cold?.temperature ?? 0), 1)} K separates the warmest and coldest capital.`, source: 'bs' },
    { id: 'states', type: 'table', span: 12, data: 'states', title: 'Current conditions per Bundesland', subtitle: 'Nearest DWD station to each state capital', insight: 'Every state at a glance; click a header to sort.', columns: [{ field: 'state', label: 'Bundesland' }, { field: 'station', label: 'Station' }, { field: 'temperature', label: '°C', format: 'number', bar: true }, { field: 'wind', label: 'Wind km/h', format: 'number' }, { field: 'gust', label: 'Gust km/h', format: 'number', bar: true }, { field: 'rain', label: 'Rain mm/h', format: 'number' }, { field: 'humidity', label: 'Humidity %', format: 'integer' }, { field: 'pressure', label: 'hPa', format: 'integer' }, { field: 'condition', label: 'Sky' }], sort: { field: 'temperature', dir: 'desc' }, source: 'bs' },
    { id: 'alerts', type: 'table', span: 6, data: 'alerts', title: 'Official DWD weather warnings', subtitle: state ? `Filtered to ${stateName(state)}` : 'All active warnings', insight: al.length ? `${al.length} warning${al.length === 1 ? '' : 's'} in force.` : 'No official weather warning is in force.', columns: [{ field: 'severity', label: 'Severity', format: 'status', status_map: { minor: { tone: 'healthy', label: 'Minor' }, moderate: { tone: 'watch', label: 'Moderate' }, severe: { tone: 'at-risk', label: 'Severe' }, extreme: { tone: 'at-risk', label: 'Extreme' } } }, { field: 'event', label: 'Event' }, { field: 'states', label: 'Länder' }, { field: 'cells', label: 'Districts', format: 'integer' }, { field: 'expires', label: 'Until' }], source: 'bs', query: 'GET api.brightsky.dev/alerts' },
    { id: 'civil', type: 'table', span: 6, data: 'civil', title: 'Civil protection warnings', subtitle: 'MoWaS, KATWARN, BIWAPP, flood portal, police', insight: cv.length ? `${cv.length} civil warning${cv.length === 1 ? '' : 's'} published through NINA.` : 'No civil protection warning is active.', columns: [{ field: 'provider', label: 'Channel' }, { field: 'warning', label: 'Warning' }, { field: 'state', label: 'Bundesland' }, { field: 'since', label: 'Since' }], source: 'nina', query: 'GET warnung.bund.de/api31/{provider}/mapData.json' },
    { id: 'climate', type: 'area', span: 6, data: 'climate', x: 'x', unit: '°C', title: 'Annual mean temperature, Germany', subtitle: `°C · 1961–1990 reference ${N.CLIMATE_REFERENCE_C} °C · curated`, insight: 'Recent years run more than two kelvin above the 1961–1990 reference.', series: [{ field: 'temperature', label: 'Annual mean' }], source: 'curated' },
    { id: 'normals', type: 'area', span: 6, data: 'normals', x: 'x', end_values: true, title: 'Climate normals 1991–2020', subtitle: 'Monthly precipitation (mm) and sunshine (h) · curated', insight: 'Summer is both the sunniest and the wettest season.', series: [{ field: 'sunshine', label: 'Sunshine h' }, { field: 'precipitation', label: 'Precipitation mm' }], source: 'curated' },
  ];
  return {
    manifest: manifest(`${round(mean(temps), 1)} °C across Germany with ${al.length} official weather warning${al.length === 1 ? '' : 's'} in force`, `Weather & warnings · ${state ? stateName(state) : 'all 16 Länder'}`, 'DWD observations at the state capitals, official warnings and long-run climate context.', [...srcs(['bs', 'Bright Sky · DWD open data'], ['nina', 'NINA · BBK']), ...CUR], tiles),
    data,
    results: [now, hist, alerts, civil],
    horizon: h,
  };
}

// ---------------------------------------------------------------- mobility
async function mobility(state: string | null): Promise<ViewOut> {
  const [traffic, rail] = await Promise.all([getTraffic(), getRail()]);
  const ev = traffic.data.events.filter((e) => !state || e.state === state);
  const works = ev.filter((e) => e.kind === 'roadworks' && !e.future);
  const closures = ev.filter((e) => e.kind === 'closure');
  const warns = ev.filter((e) => e.kind === 'warning');
  const count = <K extends string>(l: typeof ev, f: (e: (typeof ev)[number]) => K | null) => {
    const m = new Map<K, number>();
    for (const e of l) {
      const k = f(e);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byRoad = count(works, (e) => e.road);
  const byState = count(works, (e) => e.state);
  const km = works.reduce((s, e) => s + (e.lengthKm ?? 0), 0);
  const r = rail.data;
  const data: Record<string, Rows> = {
    k_works: kpi('Active roadworks, core Autobahn network', works.length, 'integer', { good_when: 'down' }),
    k_closed: kpi('Closures', closures.length, 'integer', { good_when: 'down' }),
    k_warn: kpi('Traffic warnings', warns.length, 'integer', { good_when: 'down' }),
    k_rail: kpi('Long-distance rail punctuality · modelled', round(r.longDistancePunctuality / 100, 3), 'percent', { spark: r.hourly.map((x) => x.longDistance), good_when: 'up' }),
    rail_hourly: r.hourly.map((x) => ({ x: axisLabel(x.t, 3600, 1), longDistance: x.longDistance, regional: x.regional })),
    by_road: byRoad.map(([road, n]) => ({ road, roadworks: n })),
    by_state: byState.map(([code, n]) => ({ state: stateName(code), roadworks: n })),
    lines: r.lines.map((l) => ({ line: l.line, route: l.route, category: l.category, punctuality: round(l.punctuality / 100, 3), delay: l.avgDelayMin })),
    hubs: r.hubs.filter((x) => !state || x.state === state).map((x) => ({ station: x.station, punctuality: round(x.punctuality / 100, 3), delay: x.avgDelayMin, departures: x.departuresPerHour, cancelled: x.cancelled })),
    causes: r.causes.map((c) => ({ cause: c.cause, share: c.share })),
    events: [...closures, ...warns, ...works].slice(0, 400).map((e) => ({ kind: e.kind, road: e.road, title: e.title, where: e.subtitle, km: e.lengthKm, state: stateName(e.state), blocked: e.blocked ? 'blocked' : 'open' })),
  };
  const tiles: Row[] = [
    kt('k_works'), kt('k_closed', 'neg'), kt('k_warn'), kt('k_rail'),
    { id: 'rail_hourly', type: 'area', span: 7, data: 'rail_hourly', x: 'x', unit: '%', end_values: true, title: 'Rail punctuality over the last 24 hours (modelled)', subtitle: 'Share of stops less than 6 minutes late · simulation, no open API exists', insight: `Modelled long-distance punctuality is ${r.longDistancePunctuality}% against ${r.regionalPunctuality}% for regional trains.`, series: [{ field: 'regional', label: 'Regional' }, { field: 'longDistance', label: 'Long-distance' }], source: 'sim' },
    { id: 'by_road', type: 'bar', span: 5, data: 'by_road', category: 'road', value: 'roadworks', sort: 'desc', signed: false, format: 'integer', title: 'Roadworks per Autobahn', subtitle: 'Active sites on the 24 core routes', insight: `${byRoad[0]?.[0] ?? '—'} carries the most construction sites (${byRoad[0]?.[1] ?? 0}); ${Math.round(km)} km are affected in total.`, source: 'ab', query: 'GET verkehr.autobahn.de/o/autobahn/{road}/services/roadworks' },
    { id: 'by_state', type: 'bar', span: 6, data: 'by_state', category: 'state', value: 'roadworks', sort: 'desc', signed: false, format: 'integer', title: 'Roadworks per Bundesland', subtitle: 'Sites located by coordinate', insight: `${stateName(byState[0]?.[0])} has the most active sites.`, source: 'ab' },
    { id: 'causes', type: 'bar', span: 6, data: 'causes', category: 'cause', value: 'share', sort: 'desc', signed: false, unit: '%', title: 'Modelled delay causes', subtitle: 'Share of delay minutes · simulation', insight: 'Infrastructure and knock-on effects dominate the modelled delay minutes.', source: 'sim' },
    { id: 'lines', type: 'table', span: 6, data: 'lines', title: 'Punctuality by line (modelled)', subtitle: 'Simulated in real time, refreshed every 5 seconds', insight: 'Long north–south ICE corridors trail the regional and S-Bahn lines.', columns: [{ field: 'line', label: 'Line' }, { field: 'route', label: 'Route' }, { field: 'category', label: 'Type' }, { field: 'punctuality', label: 'On time', format: 'percent', bar: true }, { field: 'delay', label: 'Ø delay min', format: 'number' }], sort: { field: 'punctuality', dir: 'asc' }, source: 'sim' },
    { id: 'hubs', type: 'table', span: 6, data: 'hubs', title: 'Main stations (modelled)', subtitle: 'Departures per hour, punctuality, cancellations', insight: 'Hub performance moves with the modelled network stress.', columns: [{ field: 'station', label: 'Station' }, { field: 'punctuality', label: 'On time', format: 'percent', bar: true }, { field: 'delay', label: 'Ø delay min', format: 'number' }, { field: 'departures', label: 'Dep/h', format: 'integer' }, { field: 'cancelled', label: 'Cancelled', format: 'integer' }], sort: { field: 'punctuality', dir: 'asc' }, source: 'sim' },
    { id: 'events', type: 'table', span: 12, data: 'events', title: 'Closures, warnings and roadworks', subtitle: `Up to 400 entries, closures first${state ? ` · ${stateName(state)}` : ''}`, insight: `${closures.filter((c) => c.blocked).length} of ${closures.length} listed closures fully block the carriageway.`, columns: [{ field: 'kind', label: 'Kind' }, { field: 'road', label: 'Road' }, { field: 'title', label: 'Section' }, { field: 'where', label: 'Detail' }, { field: 'km', label: 'km', format: 'number' }, { field: 'state', label: 'Bundesland' }, { field: 'blocked', label: 'Status', format: 'status', status_map: { blocked: { tone: 'at-risk', label: 'Blocked' }, open: { tone: 'healthy', label: 'Passable' } } }], source: 'ab' },
  ];
  return {
    manifest: manifest(`${works.length} roadworks and ${closures.length} closures on the core Autobahn network`, `Mobility · ${state ? stateName(state) : 'Germany'}`, 'Live Autobahn GmbH data for the 24 busiest routes; rail punctuality is a labelled simulation.', srcs(['ab', 'Autobahn GmbH · bund.dev'], ['sim', 'Simulation · no open rail API']), tiles),
    data,
    results: [traffic, rail],
    horizon: null,
  };
}

// ---------------------------------------------------------------- rivers
async function rivers(h0: Horizon, state: string | null): Promise<ViewOut> {
  const h = clampHorizon(h0, RIVER_HORIZONS);
  const [gauges, hist] = await Promise.all([getGauges(), getGaugeHistory(h)]);
  const key = gauges.data.filter((g) => KEY_GAUGES.includes(g.name) || g.name === 'HANN.MUENDEN');
  const by = (n: string) => gauges.data.find((g) => g.name === n);
  const kg = (id: string, name: string): Rows => {
    const g = by(name);
    const hs = hist.data.find((x) => x.name === name)?.levelCm ?? [];
    return kpi(`${gaugeName(name)} · ${title(g?.water ?? '')} · cm`, g?.levelCm ?? 0, 'integer', { delta: hs.length ? rel(g?.levelCm ?? 0, hs[0]) : undefined, delta_label: `vs ${HORIZONS[h].label} ago`, spark: sparkOf(hs) });
  };
  const kaub = by('KAUB');
  const low = gauges.data.filter((g) => g.status === 'low').length;
  const hrows: Rows = [];
  for (const g of hist.data) g.t.forEach((s, j) => { if (j % Math.max(1, Math.ceil(g.t.length / 120)) === 0 || j === g.t.length - 1) hrows.push({ gauge: gaugeName(g.name), x: axisLabel(s, h === '24h' ? 900 : 3600, HORIZONS[h].days), level: g.levelCm[j] }); });
  const list = gauges.data.filter((g) => !state || g.state === state);
  const data: Record<string, Rows> = {
    k_kaub: kg('k_kaub', 'KAUB'), k_koeln: kg('k_koeln', 'KÖLN'), k_dresden: kg('k_dresden', 'DRESDEN'), k_passau: kg('k_passau', 'PASSAU DONAU'),
    history: hrows,
    vs_mean: key.filter((g) => g.meanWaterCm !== null).map((g) => ({ gauge: gaugeName(g.name), diff: g.levelCm - (g.meanWaterCm ?? 0), position: g.levelCm >= (g.meanWaterCm ?? 0) ? 'Above mean' : 'Below mean' })),
    gauges: list.slice(0, 500).map((g) => ({ gauge: gaugeName(g.name), river: title(g.water), km: g.km, level: g.levelCm, mean: g.meanWaterCm, low: g.meanLowCm, discharge: g.dischargeM3s, status: g.status, state: stateName(g.state) })),
    by_river: [...new Set(gauges.data.map((g) => g.water))].map((wtr) => ({ river: title(wtr), low: gauges.data.filter((g) => g.water === wtr && g.status === 'low').length })),
  };
  const tiles: Row[] = [
    kt('k_kaub'), kt('k_koeln'), kt('k_dresden'), kt('k_passau'),
    { id: 'history', type: 'small_multiples', span: 8, data: 'history', facet: 'gauge', x: 'x', value: 'level', unit: 'cm', title: 'Water level at six key shipping gauges', subtitle: `${HORIZONS[h].long} · cm above gauge zero`, insight: `Kaub, the Rhine bottleneck, stands at ${kaub?.levelCm ?? '—'} cm${kaub?.meanLowCm ? ` against a mean low water of ${kaub.meanLowCm} cm` : ''}.`, source: 'po', query: 'GET pegelonline.wsv.de/.../stations/{gauge}/W/measurements.json?start=P{n}D' },
    { id: 'vs_mean', type: 'lollipop', span: 4, data: 'vs_mean', category: 'gauge', value: 'diff', color: 'position', unit: 'cm', title: 'Level relative to long-term mean water', subtitle: 'Key gauges · cm above or below MW', insight: `${key.filter((g) => g.meanWaterCm !== null && g.levelCm < (g.meanWaterCm ?? 0)).length} of ${key.filter((g) => g.meanWaterCm !== null).length} key gauges run below their mean water level.`, source: 'po' },
    { id: 'by_river', type: 'bar', span: 4, data: 'by_river', category: 'river', value: 'low', sort: 'desc', signed: false, format: 'integer', title: 'Gauges flagged low, per river', subtitle: 'Status “low” = at or below mean low water', insight: `${low} of ${gauges.data.length} gauges report low water.`, source: 'po' },
    { id: 'gauges', type: 'table', span: 8, data: 'gauges', title: 'All gauges on the federal waterways', subtitle: `Rhein, Elbe, Donau, Main, Mosel, Weser, Oder, Neckar${state ? ` · ${stateName(state)}` : ''}`, insight: 'Sortable register of every gauge with a current reading.', columns: [{ field: 'gauge', label: 'Gauge' }, { field: 'river', label: 'River' }, { field: 'km', label: 'River km', format: 'number' }, { field: 'level', label: 'Level cm', format: 'integer', bar: true }, { field: 'mean', label: 'MW cm', format: 'integer' }, { field: 'discharge', label: 'm³/s', format: 'integer' }, { field: 'status', label: 'Status', format: 'status', status_map: { low: { tone: 'watch', label: 'Low' }, normal: { tone: 'healthy', label: 'Normal' }, high: { tone: 'at-risk', label: 'High' }, unknown: { tone: 'watch', label: 'n/a' } } }, { field: 'state', label: 'Bundesland' }], sort: { field: 'river', dir: 'asc' }, source: 'po', query: 'GET pegelonline.wsv.de/.../stations.json?waters=...' },
  ];
  return {
    manifest: manifest(`Kaub gauge on the Rhine reads ${kaub?.levelCm ?? '—'} cm; ${low} gauges report low water`, `Rivers & shipping · ${HORIZONS[h].long}`, 'Water levels on the federal waterways, the hard constraint for inland shipping draught.', srcs(['po', 'PEGELONLINE · WSV']), tiles, { colors: { 'Above mean': 'pos', 'Below mean': 'neg' } }),
    data,
    results: [gauges, hist],
    horizon: h,
  };
}

// ---------------------------------------------------------------- air
const LQI = ['very good', 'good', 'moderate', 'poor', 'very poor'];
async function air(state: string | null): Promise<ViewOut> {
  const [st, hist] = await Promise.all([getAirStations(), getAirHistory()]);
  const all = st.data;
  const avg = (l: (number | null)[]) => mean(l.filter((v): v is number => typeof v === 'number'));
  const poor = all.filter((s) => s.index >= 3).length;
  const byState = STATES.map((s) => ({ state: s.name, index: round(avg(all.filter((x) => x.state === s.code).map((x) => x.index)), 2) })).filter((x) => x.index > 0 || all.length > 0);
  const hi = hist.data;
  const worst = [...byState].sort((a, b) => b.index - a.index)[0];
  const data: Record<string, Rows> = {
    k_index: kpi('Mean air quality index (0 best – 4 worst)', round(avg(all.map((s) => s.index)), 2), 'number', { spark: hi.index, good_when: 'down' }),
    k_pm10: kpi('Mean PM10 · µg/m³', round(avg(all.map((s) => s.pm10)), 1), 'number', { spark: hi.pm10, delta: rel(last(hi.pm10) ?? 0, hi.pm10[0]), delta_label: 'vs 24 h ago', good_when: 'down' }),
    k_no2: kpi('Mean NO₂ · µg/m³', round(avg(all.map((s) => s.no2)), 1), 'number', { spark: hi.no2, delta: rel(last(hi.no2) ?? 0, hi.no2[0]), delta_label: 'vs 24 h ago', good_when: 'down' }),
    k_poor: kpi('Stations rated poor or very poor', poor, 'integer', { good_when: 'down' }),
    history: hi.t.map((s, j) => ({ x: axisLabel(s, 3600, 1), pm10: hi.pm10[j], pm25: hi.pm25[j], no2: hi.no2[j], o3: hi.o3[j] })),
    by_state: byState,
    classes: LQI.map((c, i) => ({ class: `${i} · ${c}`, stations: all.filter((s) => s.index === i).length })),
    by_setting: [...new Set(all.map((s) => `${s.setting} ${s.type}`))].map((k) => ({ setting: k, no2: round(avg(all.filter((s) => `${s.setting} ${s.type}` === k).map((s) => s.no2)), 1) })).filter((x) => x.no2 > 0),
    stations: all.filter((s) => !state || s.state === state).sort((a, b) => b.index - a.index || (b.pm10 ?? 0) - (a.pm10 ?? 0)).slice(0, 500).map((s) => ({ station: s.name, city: s.city, state: stateName(s.state), setting: `${s.setting} · ${s.type}`, index: LQI[s.index] ?? 'n/a', pm10: s.pm10, pm25: s.pm25, no2: s.no2, o3: s.o3 })),
  };
  const tiles: Row[] = [
    kt('k_index'), kt('k_pm10'), kt('k_no2'), kt('k_poor', poor ? 'neg' : 'pos'),
    { id: 'history', type: 'area', span: 8, data: 'history', x: 'x', unit: 'µg/m³', end_values: true, title: 'National mean pollutant concentrations', subtitle: 'Last 24 h · hourly mean across all reporting stations · µg/m³', insight: `${all.length} stations report; ${poor} are rated poor or worse.`, series: [{ field: 'o3', label: 'Ozone' }, { field: 'no2', label: 'NO₂' }, { field: 'pm10', label: 'PM10' }, { field: 'pm25', label: 'PM2.5' }], source: 'uba', query: 'GET luftdaten.umweltbundesamt.de/api/air-data/v3/airquality/json' },
    { id: 'by_state', type: 'bar', span: 4, data: 'by_state', category: 'state', value: 'index', sort: 'desc', signed: false, format: 'number', title: 'Mean index per Bundesland', subtitle: '0 very good … 4 very poor', insight: `${worst?.state ?? '—'} has the highest mean index (${worst?.index ?? 0}).`, source: 'uba' },
    { id: 'classes', type: 'bar', span: 6, data: 'classes', category: 'class', value: 'stations', signed: false, format: 'integer', title: 'Stations per index class', subtitle: 'UBA Luftqualitätsindex, latest hour', insight: `${all.filter((s) => s.index <= 1).length} of ${all.length} stations are rated good or very good.`, source: 'uba' },
    { id: 'by_setting', type: 'bar', span: 6, data: 'by_setting', category: 'setting', value: 'no2', sort: 'desc', signed: false, unit: 'µg/m³', title: 'NO₂ by station environment', subtitle: 'Mean of latest hour · µg/m³', insight: 'Traffic-side stations carry the highest nitrogen dioxide load.', source: 'uba' },
    { id: 'stations', type: 'table', span: 12, data: 'stations', title: 'Measuring stations, worst first', subtitle: state ? stateName(state) : 'All Länder · up to 500 stations', insight: 'Station-level readings behind the national picture.', columns: [{ field: 'station', label: 'Station' }, { field: 'city', label: 'City' }, { field: 'state', label: 'Bundesland' }, { field: 'setting', label: 'Environment' }, { field: 'index', label: 'Index', format: 'status', status_map: { 'very good': { tone: 'healthy', label: 'Very good' }, good: { tone: 'healthy', label: 'Good' }, moderate: { tone: 'watch', label: 'Moderate' }, poor: { tone: 'at-risk', label: 'Poor' }, 'very poor': { tone: 'at-risk', label: 'Very poor' } } }, { field: 'pm10', label: 'PM10', format: 'integer', bar: true }, { field: 'pm25', label: 'PM2.5', format: 'integer' }, { field: 'no2', label: 'NO₂', format: 'integer', bar: true }, { field: 'o3', label: 'O₃', format: 'integer' }], source: 'uba' },
  ];
  return {
    manifest: manifest(`Air quality averages ${round(avg(all.map((s) => s.index)), 1)} on the 0–4 index; ${poor} of ${all.length} stations are rated poor`, `Air quality · ${state ? stateName(state) : 'Germany'}`, 'Hourly readings from the federal and state monitoring networks, collected by the Umweltbundesamt.', srcs(['uba', 'Umweltbundesamt']), tiles),
    data,
    results: [st, hist],
    horizon: null,
  };
}

// ---------------------------------------------------------------- economy
async function economy(h: Horizon): Promise<ViewOut> {
  const fh = clampHorizon(h, FX_HORIZONS);
  const [idx, fx, hicp, une, gdp, ifo, ins] = await Promise.all([getIndices(h), getFx(fh), getInflation(), getUnemployment(), getGdp(), getIfo(), getInsolvencies()]);
  const dax = idx.data[0];
  const chg = (q: { price: number; previousClose: number } | undefined) => rel(q?.price ?? 0, q?.previousClose);
  const usd = fx.data.rates.USD ?? 0;
  const step = h === '24h' ? 300 : h === '7d' ? 1800 : 86_400;
  const pl = (p: string) => (p.includes('Q') ? p.replace('-', ' ') : monthLabel(p));
  const data: Record<string, Rows> = {
    k_dax: kpi('DAX 40 · points', Math.round(dax?.price ?? 0), 'integer', { delta: chg(dax), delta_label: 'vs previous close', spark: sparkOf(dax?.close ?? []), good_when: 'up' }),
    k_usd: kpi('EUR/USD · ECB reference', round(usd, 4), 'number', { delta: rel(usd, fx.data.previous.USD), delta_label: 'vs previous fixing', spark: sparkOf(fx.data.series.USD ?? []) }),
    k_hicp: kpi('Inflation (HICP, y/y)', round((last(hicp.data.values) ?? 0) / 100, 4), 'percent', { delta: ((last(hicp.data.values) ?? 0) - (hicp.data.values[hicp.data.values.length - 2] ?? 0)) / 100, delta_label: `${pl(last(hicp.data.periods) ?? '')} vs prior month`, spark: hicp.data.values, good_when: 'down' }),
    k_une: kpi('Unemployment rate (ILO, s.a.)', round((last(une.data.values) ?? 0) / 100, 4), 'percent', { delta: ((last(une.data.values) ?? 0) - (une.data.values[une.data.values.length - 2] ?? 0)) / 100, delta_label: `${pl(last(une.data.periods) ?? '')} vs prior month`, spark: une.data.values, good_when: 'down' }),
    dax: (dax?.t ?? []).map((s, j) => ({ x: axisLabel(s, step, HORIZONS[h].days), dax: dax?.close[j] })),
    indices: idx.data.map((q) => ({ index: q.name, price: q.price, change: chg(q), high: q.dayHigh, low: q.dayLow })),
    macro: hicp.data.periods.map((p, j) => ({ x: pl(p), inflation: hicp.data.values[j], unemployment: une.data.values[une.data.periods.indexOf(p)] })),
    gdp: gdp.data.periods.map((p, j) => ({ quarter: pl(p), growth: gdp.data.values[j], direction: (gdp.data.values[j] ?? 0) >= 0 ? 'Growth' : 'Contraction' })),
    ifo: ifo.data.climate.periods.map((p, j) => ({ x: pl(p), climate: ifo.data.climate.values[j], situation: ifo.data.situation.values[j], expectations: ifo.data.expectations.values[j] })),
    insolvencies: ins.data.periods.map((p, j) => ({ x: pl(p), filings: ins.data.values[j] })),
    fx: Object.keys(fx.data.rates).map((c) => ({ pair: `EUR/${c}`, rate: fx.data.rates[c], day: rel(fx.data.rates[c], fx.data.previous[c]), period: rel(fx.data.rates[c], fx.data.series[c]?.[0]) })),
    fx_series: fx.data.dates.map((d, j) => ({ x: d, usd: fx.data.series.USD?.[j] })),
  };
  const g = last(gdp.data.values) ?? 0;
  const tiles: Row[] = [
    kt('k_dax'), kt('k_usd'), kt('k_hicp'), kt('k_une'),
    { id: 'dax', type: 'area', span: 8, data: 'dax', x: 'x', format: 'integer', title: 'DAX 40', subtitle: `${HORIZONS[h].long} · index points · delayed quotes`, insight: `The DAX trades at ${Math.round(dax?.price ?? 0).toLocaleString('en-US')}, ${chg(dax) >= 0 ? 'up' : 'down'} ${round(Math.abs(chg(dax)) * 100, 2)}% on the previous close.`, series: [{ field: 'dax', label: 'DAX 40' }], source: 'yh', query: 'GET query1.finance.yahoo.com/v8/finance/chart/^GDAXI' },
    { id: 'indices', type: 'table', span: 4, data: 'indices', title: 'German index family', subtitle: 'Last price and change on previous close', insight: `${idx.data.filter((q) => chg(q) >= 0).length} of ${idx.data.length} indices are in positive territory.`, columns: [{ field: 'index', label: 'Index' }, { field: 'price', label: 'Last', format: 'integer' }, { field: 'change', label: 'Change', format: 'percent_delta' }], source: 'yh' },
    { id: 'macro', type: 'area', span: 6, data: 'macro', x: 'x', unit: '%', end_values: true, title: 'Inflation and unemployment', subtitle: 'Monthly · HICP y/y and ILO unemployment rate · %', insight: `Inflation runs at ${last(hicp.data.values) ?? '—'}%, unemployment at ${last(une.data.values) ?? '—'}%.`, series: [{ field: 'inflation', label: 'Inflation' }, { field: 'unemployment', label: 'Unemployment' }], source: 'ecb', query: 'ECB ICP/M.DE.N.000000.4.ANR · Eurostat une_rt_m' },
    { id: 'gdp', type: 'lollipop', span: 6, data: 'gdp', category: 'quarter', value: 'growth', color: 'direction', unit: '%', limit: 12, title: 'Real GDP growth, quarter on quarter', subtitle: 'Price, seasonally and calendar adjusted · %', insight: `The economy ${g >= 0 ? 'grew' : 'shrank'} ${Math.abs(g)}% in ${pl(last(gdp.data.periods) ?? '')}.`, source: 'es', query: 'Eurostat namq_10_gdp (CLV_PCH_PRE, SCA, B1GQ)' },
    { id: 'ifo', type: 'area', span: 6, data: 'ifo', x: 'x', end_values: true, title: 'ifo Business Climate (modelled)', subtitle: 'Index 2015 = 100 · simulation, ifo publishes no open API', insight: `The modelled climate index stands at ${last(ifo.data.climate.values) ?? '—'}.`, series: [{ field: 'expectations', label: 'Expectations' }, { field: 'climate', label: 'Climate' }, { field: 'situation', label: 'Situation' }], source: 'sim' },
    { id: 'insolvencies', type: 'area', span: 6, data: 'insolvencies', x: 'x', format: 'integer', title: 'Corporate insolvencies (modelled)', subtitle: 'Filings per month · simulation around the Destatis level', insight: `About ${(last(ins.data.values) ?? 0).toLocaleString('en-US')} modelled filings in the latest month.`, series: [{ field: 'filings', label: 'Filings' }], source: 'sim' },
    { id: 'fx_series', type: 'area', span: 5, data: 'fx_series', x: 'x', format: 'number', title: 'EUR/USD reference rate', subtitle: `${HORIZONS[fh].long} · ECB fixing`, insight: `One euro buys ${round(usd, 4)} US dollars.`, series: [{ field: 'usd', label: 'EUR/USD' }], source: 'fx', query: 'GET api.frankfurter.dev/v1/{start}..?base=EUR' },
    { id: 'fx', type: 'table', span: 7, data: 'fx', title: 'Euro reference rates', subtitle: `ECB fixing of ${fx.data.date}`, insight: 'Daily and period moves of the euro against twelve currencies.', columns: [{ field: 'pair', label: 'Pair' }, { field: 'rate', label: 'Rate', format: 'number' }, { field: 'day', label: 'Day', format: 'percent_delta' }, { field: 'period', label: HORIZONS[fh].label, format: 'percent_delta' }], source: 'fx' },
  ];
  return {
    manifest: manifest(`DAX at ${Math.round(dax?.price ?? 0).toLocaleString('en-US')}, inflation ${last(hicp.data.values) ?? '—'}%, unemployment ${last(une.data.values) ?? '—'}%`, `Economy & markets · ${HORIZONS[h].long}`, 'Market prices, official macro releases and two clearly labelled modelled indicators.', srcs(['yh', 'Yahoo Finance chart API (unofficial)'], ['fx', 'Frankfurter · ECB'], ['ecb', 'ECB Data Portal'], ['es', 'Eurostat'], ['sim', 'Simulation · no open API']), tiles, { colors: { Growth: 'pos', Contraction: 'neg' } }),
    data,
    results: [idx, fx, hicp, une, gdp, ifo, ins],
    horizon: h,
  };
}

// ---------------------------------------------------------------- static views
function society(): ViewOut {
  const pop = last(N.POPULATION_TREND)?.population ?? 0;
  const lifeW = last(N.LIFE_EXPECTANCY)?.women ?? 0;
  const tour = last(N.TOURISM_TREND);
  const bb = last(N.BROADBAND_TREND);
  const data: Record<string, Rows> = {
    k_pop: kpi('Population · million', pop, 'number', { spark: N.POPULATION_TREND.map((x) => x.population), delta: rel(pop, N.POPULATION_TREND[0]?.population), delta_label: `since ${N.POPULATION_TREND[0]?.year}` }),
    k_life: kpi('Life expectancy, women · years', lifeW, 'number', { spark: N.LIFE_EXPECTANCY.map((x) => x.women) }),
    k_tour: kpi('Overnight stays · million', (tour?.domestic ?? 0) + (tour?.foreign ?? 0), 'integer', { spark: N.TOURISM_TREND.map((x) => x.domestic + x.foreign) }),
    k_fiber: kpi('Fibre availability, households', (bb?.fiber ?? 0) / 100, 'percent', { spark: N.BROADBAND_TREND.map((x) => x.fiber), good_when: 'up' }),
    vital: N.VITAL_STATS.map((v) => ({ x: v.year, births: v.births, deaths: v.deaths, netMigration: v.netMigration })),
    age: N.AGE_BANDS.map((a) => ({ band: a.band, millions: a.millions })),
    rents: N.CITY_RENTS.map((c) => ({ city: c.city, rent: c.rent })),
    housing: N.HOUSING_SUPPLY.map((x) => ({ x: x.year, permits: x.permits, completions: x.completions })),
    tourism: N.TOURISM_TREND.map((x) => ({ x: x.year, domestic: x.domestic, foreign: x.foreign })),
    broadband: N.BROADBAND_TREND.map((x) => ({ x: x.year, gigabit: x.gigabit, fiber: x.fiber, fiveG: x.fiveG })),
    deaths: N.CAUSES_OF_DEATH.map((c) => ({ cause: c.cause, thousand: c.thousand })),
    states: STATES.map((s) => ({ state: s.name, population: s.population, age: s.avgAge, foreign: s.foreignShare / 100, rent: s.rentEurM2, fiber: s.fiberShare / 100, beds: s.hospitalBedsPer100k, stays: s.overnightStaysM })),
  };
  const tiles: Row[] = [
    kt('k_pop'), kt('k_life'), kt('k_tour'), kt('k_fiber'),
    { id: 'vital', type: 'area', span: 8, data: 'vital', x: 'x', unit: 'k', end_values: true, title: 'Births, deaths and net migration', subtitle: 'Thousand persons per year', insight: 'Deaths exceed births every year; migration alone keeps the population growing.', series: [{ field: 'deaths', label: 'Deaths' }, { field: 'births', label: 'Births' }, { field: 'netMigration', label: 'Net migration' }], source: 'curated' },
    { id: 'age', type: 'bar', span: 4, data: 'age', category: 'band', value: 'millions', signed: false, unit: 'm', title: 'Population by age band', subtitle: 'Million persons', insight: 'The 45–59 cohort is the largest; a quarter of the population is 60 or older.', source: 'curated' },
    { id: 'rents', type: 'bar', span: 4, data: 'rents', category: 'city', value: 'rent', sort: 'desc', signed: false, unit: '€/m²', title: 'Asking rents in major cities', subtitle: '€ per m², new lettings', insight: 'München is the most expensive rental market by a wide margin.', source: 'curated' },
    { id: 'housing', type: 'area', span: 4, data: 'housing', x: 'x', unit: 'k', end_values: true, title: 'Housing permits and completions', subtitle: 'Thousand dwellings per year', insight: 'Permits have fallen well below the 400k federal target.', series: [{ field: 'permits', label: 'Permits' }, { field: 'completions', label: 'Completions' }], source: 'curated' },
    { id: 'tourism', type: 'area', span: 4, data: 'tourism', x: 'x', stacked: true, unit: 'm', title: 'Tourist overnight stays', subtitle: 'Million nights, domestic and foreign guests', insight: 'Domestic guests account for roughly five in six nights.', series: [{ field: 'domestic', label: 'Domestic' }, { field: 'foreign', label: 'Foreign' }], source: 'curated' },
    { id: 'broadband', type: 'area', span: 6, data: 'broadband', x: 'x', unit: '%', end_values: true, title: 'Digital infrastructure roll-out', subtitle: 'Share of households (5G: share of area) · %', insight: 'Gigabit coverage is broad, but true fibre still reaches a minority of homes.', series: [{ field: 'fiveG', label: '5G' }, { field: 'gigabit', label: 'Gigabit' }, { field: 'fiber', label: 'Fibre' }], source: 'curated' },
    { id: 'deaths', type: 'bar', span: 6, data: 'deaths', category: 'cause', value: 'thousand', sort: 'desc', signed: false, unit: 'k', title: 'Leading causes of death', subtitle: 'Thousand deaths per year', insight: 'Cardiovascular disease and cancer cause more than half of all deaths.', source: 'curated' },
    { id: 'states', type: 'table', span: 12, data: 'states', title: 'Society indicators per Bundesland', subtitle: 'Demographics, housing, digital, health, tourism', insight: 'City states are younger, more international and more expensive.', columns: [{ field: 'state', label: 'Bundesland' }, { field: 'population', label: 'Population k', format: 'integer', bar: true }, { field: 'age', label: 'Ø age', format: 'number' }, { field: 'foreign', label: 'Foreign nationals', format: 'percent' }, { field: 'rent', label: 'Rent €/m²', format: 'number', bar: true }, { field: 'fiber', label: 'Fibre', format: 'percent' }, { field: 'beds', label: 'Beds/100k', format: 'integer' }, { field: 'stays', label: 'Nights m', format: 'number' }], sort: { field: 'population', dir: 'desc' }, source: 'curated' },
  ];
  return { manifest: manifest(`${pop} million people, ageing and growing only through migration`, 'Society · curated reference data', 'Demographics, housing, health, tourism and digital infrastructure. Curated, rounded reference values — not live.', CUR, tiles), data, results: [], horizon: null };
}

function politics(): ViewOut {
  const coalition = N.BUNDESTAG.filter((p) => p.role === 'Government').reduce((s, p) => s + p.seats, 0);
  const debt = last(N.PUBLIC_DEBT);
  const data: Record<string, Rows> = {
    k_coal: kpi(`Coalition seats (majority ${N.BUNDESTAG_MAJORITY})`, coalition, 'integer', {}),
    k_turn: kpi('Turnout, federal election 2025', (last(N.TURNOUT)?.turnout ?? 0) / 100, 'percent', { spark: N.TURNOUT.map((t) => t.turnout) }),
    k_debt: kpi('Public debt · % of GDP', (debt?.ratio ?? 0) / 100, 'percent', { spark: N.PUBLIC_DEBT.map((d) => d.ratio), good_when: 'down' }),
    k_budget: kpi('Federal budget · bn €', N.FEDERAL_BUDGET_TOTAL, 'number', {}),
    seats: N.BUNDESTAG.filter((p) => p.seats > 0).map((p) => ({ party: p.party, seats: p.seats })),
    elections: N.ELECTION_HISTORY.map((e) => ({ x: e.year, cdu: e['CDU/CSU'], spd: e.SPD, afd: e.AfD, gruene: e['Grüne'], fdp: e.FDP, linke: e.Linke })),
    change: N.BUNDESTAG.map((p) => ({ party: p.party, change: p.seats - p.previousSeats, direction: p.seats >= p.previousSeats ? 'Gain' : 'Loss' })),
    debt: N.PUBLIC_DEBT.map((d) => ({ x: d.year, ratio: d.ratio })),
    budget: N.FEDERAL_BUDGET.map((b) => ({ item: b.item, bn: b.bn })),
    tax: N.TAX_REVENUE.map((t) => ({ tax: t.tax, bn: t.bn })),
    peers: N.DEBT_PEERS.map((p) => ({ country: p.country, ratio: p.ratio })),
    laender: STATES.map((s) => ({ state: s.name, head: s.government.head, party: s.government.headParty, coalition: s.government.parties.join(' + '), votes: s.government.bundesratVotes, next: String(s.government.nextElection), debt: s.debtPerCapita })),
  };
  const tiles: Row[] = [
    kt('k_coal'), kt('k_turn'), kt('k_debt'), kt('k_budget'),
    { id: 'seats', type: 'bar', span: 7, data: 'seats', category: 'party', value: 'seats', sort: 'desc', signed: false, format: 'integer', title: '21st Bundestag: seats by parliamentary group', subtitle: `${N.BUNDESTAG_SEATS} seats · election of 23 February 2025`, insight: `CDU/CSU and SPD hold ${coalition} seats, ${coalition - N.BUNDESTAG_MAJORITY + 1} more than the bare minimum for a majority.`, source: 'curated' },
    { id: 'change', type: 'lollipop', span: 5, data: 'change', category: 'party', value: 'change', color: 'direction', format: 'integer', title: 'Seat change versus the 20th Bundestag', subtitle: 'Seats gained or lost', insight: 'The SPD and FDP lost the most seats; the AfD nearly doubled its group.', source: 'curated' },
    { id: 'elections', type: 'area', span: 6, data: 'elections', x: 'x', unit: '%', end_values: true, title: 'Federal election results since 2005', subtitle: 'Second votes · %', insight: 'The two traditional Volksparteien together fell from 69% to 45%.', series: [{ field: 'cdu', label: 'CDU/CSU' }, { field: 'spd', label: 'SPD' }, { field: 'afd', label: 'AfD' }, { field: 'gruene', label: 'Grüne' }, { field: 'fdp', label: 'FDP' }, { field: 'linke', label: 'Linke' }], source: 'curated' },
    { id: 'debt', type: 'area', span: 6, data: 'debt', x: 'x', unit: '%', title: 'General government debt', subtitle: 'Maastricht definition · % of GDP', insight: `Debt stands at ${debt?.ratio}% of GDP, just above the 60% Maastricht reference.`, series: [{ field: 'ratio', label: 'Debt ratio' }], source: 'curated' },
    { id: 'budget', type: 'bar', span: 6, data: 'budget', category: 'item', value: 'bn', sort: 'desc', signed: false, unit: 'bn €', title: 'Federal budget by ministry portfolio', subtitle: 'Planned expenditure · bn €', insight: 'Arbeit und Soziales absorbs well over a third of federal spending.', source: 'curated' },
    { id: 'tax', type: 'bar', span: 6, data: 'tax', category: 'tax', value: 'bn', sort: 'desc', signed: false, unit: 'bn €', title: 'Tax revenue by tax type', subtitle: `2024 · bn € of ${N.TAX_REVENUE_TOTAL} bn total`, insight: 'VAT and wage tax together raise more than half of all tax revenue.', source: 'curated' },
    { id: 'laender', type: 'table', span: 12, data: 'laender', title: 'State governments', subtitle: 'Status early 2025 · later elections and changes of office are not reflected', insight: 'Sixteen governments, seven different coalition formats.', columns: [{ field: 'state', label: 'Bundesland' }, { field: 'head', label: 'Head of government' }, { field: 'party', label: 'Party' }, { field: 'coalition', label: 'Coalition' }, { field: 'votes', label: 'Bundesrat votes', format: 'integer', bar: true }, { field: 'next', label: 'Next election' }, { field: 'debt', label: 'Debt €/capita', format: 'integer', bar: true }], source: 'curated' },
  ];
  return { manifest: manifest(`A ${coalition}-seat CDU/CSU–SPD coalition governs with public debt at ${debt?.ratio}% of GDP`, 'Politics & public finances · curated reference data', 'Bundestag, state governments, debt, budget and taxes. Curated, rounded reference values — not live.', CUR, tiles, { colors: { Gain: 'pos', Loss: 'neg' } }), data, results: [], horizon: null };
}

// ---------------------------------------------------------------- overview
async function overview(h: Horizon): Promise<ViewOut> {
  const [power, price, idx, wx, gauges, alerts, rail, traffic, air0] = await Promise.all([getPower(h), getPrice(h), getIndices(h), getWeatherNow(), getGauges(), getWeatherAlerts(), getRail(), getTraffic(), getAirStations()]);
  const p = power.data;
  const i = p.t.length - 1;
  const { days, label } = HORIZONS[h];
  const shares = p.t.map((_, j) => renShare(p.mw, j));
  const loadGw = (p.load[i] ?? 0) / 1000;
  const dax = idx.data[0];
  const kaub = gauges.data.find((g) => g.name === 'KAUB');
  const temps = wx.data.map((x) => x.temperature);
  const works = traffic.data.events.filter((e) => e.kind === 'roadworks' && !e.future).length;
  const step = h === '24h' ? 300 : h === '7d' ? 1800 : 86_400;
  const data: Record<string, Rows> = {
    k_load: kpi('Grid load · GW', round(loadGw, 1), 'number', { delta: rel(loadGw, (p.load[0] ?? 0) / 1000), delta_label: `vs ${label} ago`, spark: sparkOf(p.load) }),
    k_ren: kpi('Renewable share of generation', round(shares[i] ?? 0, 3), 'percent', { delta: (shares[i] ?? 0) - (shares[0] ?? 0), delta_label: `vs ${label} ago`, spark: sparkOf(shares), good_when: 'up' }),
    k_price: kpi('Day-ahead price · €/MWh', round(last(price.data.history.v) ?? 0, 1), 'number', { spark: sparkOf(price.data.history.v), delta: rel(last(price.data.history.v) ?? 0, mean(price.data.history.v)), delta_label: `vs ${label} mean`, good_when: 'down' }),
    k_dax: kpi('DAX 40 · points', Math.round(dax?.price ?? 0), 'integer', { delta: rel(dax?.price ?? 0, dax?.previousClose), delta_label: 'vs previous close', spark: sparkOf(dax?.close ?? []), good_when: 'up' }),
    k_temp: kpi('Mean temperature · °C', round(mean(temps), 1), 'number', {}),
    k_kaub: kpi('Rhine at Kaub · cm', kaub?.levelCm ?? 0, 'integer', {}),
    k_alerts: kpi('DWD weather warnings', alerts.data.length, 'integer', { good_when: 'down' }),
    k_rail: kpi('ICE/IC punctuality · modelled', round(rail.data.longDistancePunctuality / 100, 3), 'percent', { spark: rail.data.hourly.map((x) => x.longDistance), good_when: 'up' }),
    mix: p.t.map((s, j) => {
      const r: Row = { x: axisLabel(s, p.bucketSec, days) };
      for (const k of GENERATION_KEYS) r[k] = round((p.mw[k]?.[j] ?? 0) / 1000, 2);
      return r;
    }),
    temps: wx.data.map((x) => ({ state: x.name, temperature: x.temperature })),
    dax: (dax?.t ?? []).map((s, j) => ({ x: axisLabel(s, step, days), dax: dax?.close[j] })),
    price: price.data.history.t.map((s, j) => ({ x: axisLabel(s, price.data.bucketSec, days), price: price.data.history.v[j] })),
    pulse: [
      { domain: 'Autobahn', reading: `${works} active roadworks on 24 core routes`, feed: traffic.status },
      { domain: 'Air', reading: `${air0.data.filter((s) => s.index >= 3).length} of ${air0.data.length} stations rated poor`, feed: air0.status },
      { domain: 'Rivers', reading: `${gauges.data.filter((g) => g.status === 'low').length} gauges at low water`, feed: gauges.status },
      { domain: 'Weather', reading: `${round(Math.min(...temps), 1)} to ${round(Math.max(...temps), 1)} °C across the capitals`, feed: wx.status },
      { domain: 'Rail', reading: `${rail.data.trainsRunning} trains running, ${rail.data.cancellationRate}% cancelled (model)`, feed: rail.status },
      { domain: 'Markets', reading: `${idx.data.filter((q) => q.price >= q.previousClose).length} of ${idx.data.length} indices up on the day`, feed: idx.status },
    ],
  };
  const tiles: Row[] = [
    kt('k_load'), kt('k_ren', 'pos'), kt('k_price'), kt('k_dax'), kt('k_temp'), kt('k_kaub'), kt('k_alerts'), kt('k_rail'),
    { id: 'mix', type: 'area', span: 8, data: 'mix', x: 'x', stacked: true, unit: 'GW', title: 'Power generation by source', subtitle: `${HORIZONS[h].long} · GW`, insight: `Renewables supply ${Math.round((shares[i] ?? 0) * 100)}% of generation at a load of ${round(loadGw, 1)} GW.`, series: GENERATION_KEYS.map((k) => ({ field: k, label: GEN_LABEL[k] })), source: 'ec' },
    { id: 'temps', type: 'bar', span: 4, data: 'temps', category: 'state', value: 'temperature', sort: 'desc', signed: false, unit: '°C', title: 'Temperature by Bundesland', subtitle: 'State capitals, latest DWD observation', insight: `Capitals average ${round(mean(temps), 1)} °C.`, source: 'bs' },
    { id: 'dax', type: 'area', span: 6, data: 'dax', x: 'x', format: 'integer', title: 'DAX 40', subtitle: `${HORIZONS[h].long} · points`, insight: `The DAX trades at ${Math.round(dax?.price ?? 0).toLocaleString('en-US')}.`, series: [{ field: 'dax', label: 'DAX 40' }], source: 'yh' },
    { id: 'price', type: 'area', span: 6, data: 'price', x: 'x', unit: '€/MWh', title: 'Day-ahead power price', subtitle: `${HORIZONS[h].long} · €/MWh`, insight: `Wholesale power costs ${round(last(price.data.history.v) ?? 0, 0)} €/MWh.`, series: [{ field: 'price', label: 'Day-ahead' }], source: 'ec' },
    { id: 'pulse', type: 'table', span: 12, data: 'pulse', title: 'Situation by domain', subtitle: 'One line per domain with the state of its feed', insight: 'A cross-domain reading of the country in six lines.', columns: [{ field: 'domain', label: 'Domain' }, { field: 'reading', label: 'Reading' }, { field: 'feed', label: 'Feed', format: 'status', status_map: { LIVE: { tone: 'healthy', label: 'LIVE' }, SIMULATED: { tone: 'watch', label: 'SIMULATED' }, STALE: { tone: 'watch', label: 'STALE' }, ERROR: { tone: 'at-risk', label: 'ERROR' } } }], source: 'ec' },
  ];
  return {
    manifest: manifest(`Germany now: ${round(loadGw, 1)} GW load, ${Math.round((shares[i] ?? 0) * 100)}% renewable, DAX ${Math.round(dax?.price ?? 0).toLocaleString('en-US')}`, `Command center · ${HORIZONS[h].long}`, 'The headline readings from every live domain on one screen.', srcs(['ec', 'Energy-Charts · Fraunhofer ISE'], ['bs', 'Bright Sky · DWD'], ['yh', 'Yahoo Finance (unofficial)']), tiles, { colors: { Solar: 'accent', 'Wind onshore': 'pos', 'Wind offshore': 'accent-2', Lignite: 'neg' } }),
    data,
    results: [power, price, idx, wx, gauges, alerts, rail, traffic, air0],
    horizon: h,
  };
}

export async function buildView(id: string, h: Horizon, state: string | null): Promise<ViewOut | null> {
  const st = state && STATE_BY_CODE[state] ? state : null;
  switch (id) {
    case 'overview': return overview(h);
    case 'energy': return energy(h);
    case 'weather': return weather(h, st);
    case 'mobility': return mobility(st);
    case 'rivers': return rivers(h, st);
    case 'air': return air(st);
    case 'economy': return economy(h);
    case 'society': return society();
    case 'politics': return politics();
    default: return null;
  }
}

// ---------------------------------------------------------------- map rows & ticker
export async function buildStateRows(): Promise<{ rows: StateRow[]; results: FeedResult<unknown>[] }> {
  const [wx, airS, alerts, traffic] = await Promise.all([getWeatherNow(), getAirStations(), getWeatherAlerts(), getTraffic()]);
  const rows = STATES.map((s): StateRow => {
    const w = wx.data.find((x) => x.code === s.code);
    const a = airS.data.filter((x) => x.state === s.code);
    const pm = a.map((x) => x.pm10).filter((v): v is number => typeof v === 'number');
    return {
      code: s.code, name: s.name, capital: s.capital, region: s.region,
      head: s.government.head, headParty: s.government.headParty, coalition: s.government.parties.join(' + '), nextElection: s.government.nextElection,
      ...staticMetrics(s),
      temperature: w ? w.temperature : null,
      windSpeed: w ? w.windSpeed : null,
      airIndex: a.length ? round(mean(a.map((x) => x.index)), 2) : null,
      pm10: pm.length ? Math.round(mean(pm)) : null,
      weatherAlerts: alerts.data.filter((x) => x.states.includes(s.code)).length,
      roadworks: traffic.data.events.filter((e) => e.kind === 'roadworks' && !e.future && e.state === s.code).length,
    };
  });
  return { rows, results: [wx, airS, alerts, traffic] };
}

export async function buildTicker(): Promise<TickerItem[]> {
  const [power, price, co2, idx, fx, wx, gauges, alerts, rail, traffic] = await Promise.all([getPower('24h'), getPrice('24h'), getCo2(), getIndices('24h'), getFx('30d'), getWeatherNow(), getGauges(), getWeatherAlerts(), getRail(), getTraffic()]);
  const p = power.data;
  const i = p.t.length - 1;
  const item = (id: string, label: string, value: number, unit: string, digits: number, delta: number | null, deltaLabel: string, goodWhen: TickerItem['goodWhen'], status: TickerItem['status'], href: string): TickerItem => ({
    id, label, value, unit, delta, deltaLabel, goodWhen, status, href,
    display: value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  });
  const out: TickerItem[] = [
    item('load', 'LOAD', (p.load[i] ?? 0) / 1000, 'GW', 1, rel(p.load[i] ?? 0, p.load[Math.max(0, i - 4)]), '1h', 'neutral', power.status, '/energy'),
    item('ren', 'RENEWABLES', renShare(p.mw, i) * 100, '%', 1, null, '', 'up', power.status, '/energy'),
    item('price', 'DAY-AHEAD', last(price.data.history.v) ?? 0, '€/MWh', 1, rel(last(price.data.history.v) ?? 0, price.data.history.v[Math.max(0, price.data.history.v.length - 5)]), '1h', 'down', price.status, '/energy'),
    item('co2', 'CO₂', last(co2.data.actual.v) ?? 0, 'g/kWh', 0, null, '', 'down', co2.status, '/energy'),
    ...idx.data.slice(0, 3).map((q) => item(q.symbol, q.name.toUpperCase(), q.price, 'pts', 0, rel(q.price, q.previousClose), 'day', 'up' as const, idx.status, '/economy')),
    item('usd', 'EUR/USD', fx.data.rates.USD ?? 0, '', 4, rel(fx.data.rates.USD ?? 0, fx.data.previous.USD), 'day', 'neutral', fx.status, '/economy'),
    item('chf', 'EUR/CHF', fx.data.rates.CHF ?? 0, '', 4, rel(fx.data.rates.CHF ?? 0, fx.data.previous.CHF), 'day', 'neutral', fx.status, '/economy'),
    item('temp', 'TEMP Ø', mean(wx.data.map((x) => x.temperature)), '°C', 1, null, '', 'neutral', wx.status, '/weather'),
    item('alerts', 'DWD WARNINGS', alerts.data.length, '', 0, null, '', 'down', alerts.status, '/weather'),
    item('kaub', 'RHEIN/KAUB', gauges.data.find((g) => g.name === 'KAUB')?.levelCm ?? 0, 'cm', 0, null, '', 'neutral', gauges.status, '/rivers'),
    item('works', 'ROADWORKS', traffic.data.events.filter((e) => e.kind === 'roadworks' && !e.future).length, '', 0, null, '', 'down', traffic.status, '/mobility'),
    item('rail', 'ICE ON TIME', rail.data.longDistancePunctuality, '%', 1, null, '', 'up', rail.status, '/mobility'),
    item('trains', 'TRAINS RUNNING', rail.data.trainsRunning, '', 0, null, '', 'neutral', rail.status, '/mobility'),
  ];
  return out;
}
