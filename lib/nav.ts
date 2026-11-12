import type { Horizon } from '@/lib/domain/types';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  blurb: string;
  /** Horizons the view can honour; empty = the view has no time axis driven by the selector. */
  horizons: Horizon[];
  keywords: string;
}

const ALL: Horizon[] = ['24h', '7d', '30d', '1y'];

export const NAV: NavItem[] = [
  { id: 'overview', label: 'Command Center', href: '/', icon: 'gauge', blurb: 'Germany right now', horizons: ALL, keywords: 'home overview pulse' },
  { id: 'states', label: 'Map & Bundesländer', href: '/states', icon: 'map', blurb: 'Choropleth, drill-down, comparison', horizons: [], keywords: 'map states länder choropleth compare' },
  { id: 'energy', label: 'Energy Grid', href: '/energy', icon: 'zap', blurb: 'Generation, load, price, CO₂, flows', horizons: ALL, keywords: 'power electricity solar wind price co2 smard' },
  { id: 'weather', label: 'Weather & Warnings', href: '/weather', icon: 'cloud', blurb: 'DWD observations, official alerts', horizons: ['24h', '7d', '30d'], keywords: 'temperature wind dwd nina alerts climate' },
  { id: 'mobility', label: 'Mobility', href: '/mobility', icon: 'route', blurb: 'Autobahn, rail punctuality', horizons: [], keywords: 'autobahn roadworks closures rail bahn ice' },
  { id: 'rivers', label: 'Rivers & Shipping', href: '/rivers', icon: 'waves', blurb: 'Gauges on Rhein, Elbe, Donau', horizons: ['24h', '7d', '30d'], keywords: 'pegel kaub rhein elbe donau water level' },
  { id: 'air', label: 'Air Quality', href: '/air', icon: 'wind', blurb: 'UBA stations, pollutants', horizons: [], keywords: 'pm10 no2 ozone uba luft' },
  { id: 'economy', label: 'Economy & Markets', href: '/economy', icon: 'trending', blurb: 'DAX, FX, inflation, GDP, ifo', horizons: ALL, keywords: 'dax euro fx inflation unemployment gdp ifo insolvencies' },
  { id: 'society', label: 'Society', href: '/society', icon: 'users', blurb: 'Demographics, housing, health, tourism, digital', horizons: [], keywords: 'population rent housing health tourism broadband fibre' },
  { id: 'politics', label: 'Politics & Finances', href: '/politics', icon: 'landmark', blurb: 'Bundestag, Länder, debt, budget', horizons: [], keywords: 'bundestag seats government debt budget tax' },
  { id: 'system', label: 'Network Health', href: '/system', icon: 'activity', blurb: 'Feed status, latency, uptime', horizons: [], keywords: 'feeds status live simulated health' },
];

export const DASH_VIEWS = ['overview', 'energy', 'weather', 'mobility', 'rivers', 'air', 'economy', 'society', 'politics'];
export const navFor = (path: string): NavItem => NAV.find((n) => (n.href === '/' ? path === '/' : path.startsWith(n.href))) ?? NAV[0];
