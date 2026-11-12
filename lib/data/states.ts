/**
 * Curated structural reference data for the 16 Bundesländer.
 *
 * These figures are a hand-curated snapshot (reference years 2023/2024, rounded) compiled from the public
 * statistics named in STATE_METRICS[].source. They are approximations for comparison, not an official
 * release, and they do not update automatically. Governments reflect the status of early 2025.
 */
import type { StateMetricDef, StateProfile } from '@/lib/domain/types';

type Row = [
  code: string, ags: string, name: string, capital: string, lat: number, lon: number, region: 'West' | 'East', cityState: boolean,
  population: number, areaKm2: number, gdpBn: number, unemployment: number, avgAge: number, foreignShare: number, rentEurM2: number,
  fiberShare: number, hospitalBeds: number, overnightStaysM: number, debtPerCapita: number, renewableShare: number, windMw: number, solarMwp: number,
  head: string, headParty: string, parties: string[], nextElection: number, bundesratVotes: number,
];

const ROWS: Row[] = [
  ['BW', '08', 'Baden-Württemberg', 'Stuttgart', 48.78, 9.18, 'West', false, 11280, 35748, 615, 4.2, 43.8, 18.6, 11.5, 21, 494, 57.0, 4000, 35, 1900, 12500, 'Winfried Kretschmann', 'Grüne', ['Grüne', 'CDU'], 2026, 6],
  ['BY', '09', 'Bayern', 'München', 48.14, 11.58, 'West', false, 13370, 70542, 768, 3.7, 44.0, 16.0, 12.6, 33, 568, 100.2, 1400, 55, 2700, 26000, 'Markus Söder', 'CSU', ['CSU', 'Freie Wähler'], 2028, 6],
  ['BE', '11', 'Berlin', 'Berlin', 52.52, 13.4, 'East', true, 3760, 891, 193, 9.7, 42.7, 24.4, 13.0, 20, 546, 29.6, 16500, 6, 20, 350, 'Kai Wegner', 'CDU', ['CDU', 'SPD'], 2026, 4],
  ['BB', '12', 'Brandenburg', 'Potsdam', 52.4, 13.06, 'East', false, 2570, 29654, 97, 6.1, 47.3, 7.6, 8.9, 42, 598, 14.5, 7700, 50, 8800, 7500, 'Dietmar Woidke', 'SPD', ['SPD', 'BSW'], 2029, 4],
  ['HB', '04', 'Bremen', 'Bremen', 53.08, 8.8, 'West', true, 680, 419, 39, 11.1, 43.6, 21.9, 9.8, 30, 720, 2.7, 33800, 15, 200, 150, 'Andreas Bovenschulte', 'SPD', ['SPD', 'Grüne', 'Linke'], 2027, 3],
  ['HH', '02', 'Hamburg', 'Hamburg', 53.55, 9.99, 'West', true, 1890, 755, 151, 8.0, 42.1, 20.0, 13.9, 62, 660, 16.0, 17200, 5, 120, 200, 'Peter Tschentscher', 'SPD', ['SPD', 'Grüne'], 2030, 3],
  ['HE', '06', 'Hessen', 'Wiesbaden', 50.08, 8.24, 'West', false, 6390, 21116, 351, 5.5, 44.0, 19.3, 11.6, 28, 566, 34.4, 8200, 50, 2600, 4700, 'Boris Rhein', 'CDU', ['CDU', 'SPD'], 2028, 5],
  ['MV', '13', 'Mecklenburg-Vorpommern', 'Schwerin', 53.63, 11.41, 'East', false, 1630, 23295, 59, 7.8, 47.6, 6.8, 7.9, 48, 633, 32.1, 5200, 78, 3900, 4200, 'Manuela Schwesig', 'SPD', ['SPD', 'Linke'], 2026, 3],
  ['NI', '03', 'Niedersachsen', 'Hannover', 52.37, 9.74, 'West', false, 8140, 47710, 364, 5.9, 44.8, 12.5, 8.6, 52, 510, 45.4, 8300, 60, 12900, 8500, 'Olaf Lies', 'SPD', ['SPD', 'Grüne'], 2027, 6],
  ['NW', '05', 'Nordrhein-Westfalen', 'Düsseldorf', 51.23, 6.78, 'West', false, 18140, 34112, 839, 7.5, 44.3, 16.7, 9.4, 39, 640, 52.5, 10300, 22, 7700, 11500, 'Hendrik Wüst', 'CDU', ['CDU', 'Grüne'], 2027, 6],
  ['RP', '07', 'Rheinland-Pfalz', 'Mainz', 50.0, 8.27, 'West', false, 4160, 19858, 174, 5.3, 45.0, 14.1, 9.0, 30, 580, 22.3, 8500, 50, 4100, 4800, 'Alexander Schweitzer', 'SPD', ['SPD', 'Grüne', 'FDP'], 2026, 4],
  ['SL', '10', 'Saarland', 'Saarbrücken', 49.24, 7.0, 'West', false, 990, 2571, 41, 7.0, 46.6, 14.9, 7.6, 22, 660, 3.2, 14600, 25, 550, 1000, 'Anke Rehlinger', 'SPD', ['SPD'], 2027, 3],
  ['SN', '14', 'Sachsen', 'Dresden', 51.05, 13.74, 'East', false, 4090, 18450, 155, 6.5, 46.9, 7.9, 6.9, 36, 622, 19.3, 1500, 20, 1400, 4200, 'Michael Kretschmer', 'CDU', ['CDU', 'SPD'], 2029, 4],
  ['ST', '15', 'Sachsen-Anhalt', 'Magdeburg', 52.13, 11.63, 'East', false, 2190, 20464, 78, 7.7, 48.1, 7.9, 6.5, 50, 680, 8.4, 9800, 62, 5500, 5000, 'Reiner Haseloff', 'CDU', ['CDU', 'SPD', 'FDP'], 2026, 4],
  ['SH', '01', 'Schleswig-Holstein', 'Kiel', 54.32, 10.14, 'West', false, 2950, 15804, 118, 5.8, 45.6, 10.6, 9.9, 73, 540, 37.6, 11000, 75, 8900, 3600, 'Daniel Günther', 'CDU', ['CDU', 'Grüne'], 2027, 4],
  ['TH', '16', 'Thüringen', 'Erfurt', 50.98, 11.03, 'East', false, 2130, 16202, 75, 6.2, 47.6, 8.0, 6.8, 27, 720, 9.7, 7600, 60, 1900, 2900, 'Mario Voigt', 'CDU', ['CDU', 'BSW', 'SPD'], 2029, 4],
];

export const STATES: StateProfile[] = ROWS.map((r) => ({
  code: r[0], ags: r[1], name: r[2], capital: r[3], lat: r[4], lon: r[5], region: r[6], cityState: r[7],
  population: r[8], areaKm2: r[9], gdpBn: r[10], unemployment: r[11], avgAge: r[12], foreignShare: r[13], rentEurM2: r[14],
  fiberShare: r[15], hospitalBedsPer100k: r[16], overnightStaysM: r[17], debtPerCapita: r[18], renewableShare: r[19], windMw: r[20], solarMwp: r[21],
  government: { head: r[22], headParty: r[23], parties: r[24], nextElection: r[25], bundesratVotes: r[26] },
}));

export const STATE_BY_CODE: Record<string, StateProfile> = Object.fromEntries(STATES.map((s) => [s.code, s]));
export const STATE_BY_AGS: Record<string, StateProfile> = Object.fromEntries(STATES.map((s) => [s.ags, s]));
export const stateName = (code: string | null | undefined): string => (code && STATE_BY_CODE[code]?.name) || '—';

export const GERMANY_POPULATION_K = STATES.reduce((s, x) => s + x.population, 0);
export const GERMANY_GDP_BN = STATES.reduce((s, x) => s + x.gdpBn, 0);

export const density = (s: StateProfile): number => (s.population * 1000) / s.areaKm2;
export const gdpPerCapita = (s: StateProfile): number => (s.gdpBn * 1e6) / s.population;

const m = (
  id: string, label: string, unit: string, decimals: number, group: string, source: string, higherIsBetter: boolean | null, live = false,
): StateMetricDef => ({ id, label, unit, decimals, group, source, higherIsBetter, live });

const CURATED = 'curated snapshot';

/** Every metric available on the map, in the comparison view and in global search. */
export const STATE_METRICS: StateMetricDef[] = [
  m('temperature', 'Temperature now', '°C', 1, 'Live', 'Bright Sky · DWD', null, true),
  m('windSpeed', 'Wind speed now', 'km/h', 0, 'Live', 'Bright Sky · DWD', null, true),
  m('airIndex', 'Air quality index (0 best – 4 worst)', 'LQI', 2, 'Live', 'Umweltbundesamt', false, true),
  m('pm10', 'PM10 now', 'µg/m³', 0, 'Live', 'Umweltbundesamt', false, true),
  m('weatherAlerts', 'Active DWD warnings', '', 0, 'Live', 'Bright Sky · DWD', false, true),
  m('roadworks', 'Autobahn roadworks (core network)', '', 0, 'Live', 'Autobahn GmbH', false, true),
  m('population', 'Population', 'k', 0, 'Demographics', `Destatis 2023 · ${CURATED}`, null),
  m('density', 'Population density', '/km²', 0, 'Demographics', `Destatis 2023 · ${CURATED}`, null),
  m('avgAge', 'Average age', 'yrs', 1, 'Demographics', `Destatis 2023 · ${CURATED}`, null),
  m('foreignShare', 'Foreign nationals', '%', 1, 'Demographics', `Destatis 2023 · ${CURATED}`, null),
  m('gdpBn', 'GDP', 'bn €', 0, 'Economy', `VGRdL 2023 · ${CURATED}`, true),
  m('gdpPerCapita', 'GDP per capita', '€', 0, 'Economy', `VGRdL 2023 · ${CURATED}`, true),
  m('unemployment', 'Unemployment rate', '%', 1, 'Economy', `Bundesagentur für Arbeit 2024 · ${CURATED}`, false),
  m('debtPerCapita', 'Public debt per capita (Land + municipalities)', '€', 0, 'Public finances', `Destatis 2023 · ${CURATED}`, false),
  m('rentEurM2', 'Asking rent', '€/m²', 1, 'Housing', `Market reports 2024 · ${CURATED}`, false),
  m('fiberShare', 'Fibre (FTTH/B) availability', '%', 0, 'Digital', `Gigabit-Grundbuch 2024 · ${CURATED}`, true),
  m('hospitalBedsPer100k', 'Hospital beds per 100k', '', 0, 'Health', `Destatis 2023 · ${CURATED}`, true),
  m('overnightStaysM', 'Tourist overnight stays', 'm', 1, 'Tourism', `Destatis 2023 · ${CURATED}`, true),
  m('renewableShare', 'Renewable share of power generation', '%', 0, 'Energy', `AEE / Länder statistics · ${CURATED}`, true),
  m('windMw', 'Onshore wind capacity', 'MW', 0, 'Energy', `Marktstammdatenregister 2024 · ${CURATED}`, true),
  m('solarMwp', 'Solar PV capacity', 'MWp', 0, 'Energy', `Marktstammdatenregister 2024 · ${CURATED}`, true),
  m('bundesratVotes', 'Bundesrat votes', '', 0, 'Politics', 'Grundgesetz Art. 51', null),
];

export const STATE_METRIC_BY_ID: Record<string, StateMetricDef> = Object.fromEntries(STATE_METRICS.map((x) => [x.id, x]));

/** Static metric values for one state, keyed by STATE_METRICS ids. */
export function staticMetrics(s: StateProfile): Record<string, number> {
  return {
    population: s.population,
    density: Math.round(density(s)),
    avgAge: s.avgAge,
    foreignShare: s.foreignShare,
    gdpBn: s.gdpBn,
    gdpPerCapita: Math.round(gdpPerCapita(s) / 100) * 100,
    unemployment: s.unemployment,
    debtPerCapita: s.debtPerCapita,
    rentEurM2: s.rentEurM2,
    fiberShare: s.fiberShare,
    hospitalBedsPer100k: s.hospitalBedsPer100k,
    overnightStaysM: s.overnightStaysM,
    renewableShare: s.renewableShare,
    windMw: s.windMw,
    solarMwp: s.solarMwp,
    bundesratVotes: s.government.bundesratVotes,
  };
}
