/**
 * Curated national reference series (rounded, reference years as labelled).
 * Hand-compiled approximations of the public statistics named next to each block — not an official
 * release and not auto-updating. Live series (prices, inflation, unemployment, GDP …) come from feeds.
 */

export const CURATED_NOTE = 'Curated snapshot · rounded reference values, not auto-updating';

// ---------- Politics: 21st Bundestag (election 23 Feb 2025), source: Bundeswahlleiterin ----------
export interface BundestagParty {
  party: string;
  seats: number;
  voteShare: number;
  previousSeats: number;
  role: 'Government' | 'Opposition';
}

export const BUNDESTAG: BundestagParty[] = [
  { party: 'CDU/CSU', seats: 208, voteShare: 28.5, previousSeats: 197, role: 'Government' },
  { party: 'AfD', seats: 152, voteShare: 20.8, previousSeats: 83, role: 'Opposition' },
  { party: 'SPD', seats: 120, voteShare: 16.4, previousSeats: 206, role: 'Government' },
  { party: 'Grüne', seats: 85, voteShare: 11.6, previousSeats: 118, role: 'Opposition' },
  { party: 'Die Linke', seats: 64, voteShare: 8.8, previousSeats: 39, role: 'Opposition' },
  { party: 'SSW', seats: 1, voteShare: 0.2, previousSeats: 1, role: 'Opposition' },
  { party: 'FDP', seats: 0, voteShare: 4.3, previousSeats: 91, role: 'Opposition' },
  { party: 'BSW', seats: 0, voteShare: 4.98, previousSeats: 0, role: 'Opposition' },
];
export const BUNDESTAG_SEATS = 630;
export const BUNDESTAG_MAJORITY = 316;

/** Federal election results, second votes in %. Source: Bundeswahlleiterin. */
export const ELECTION_HISTORY: { year: string; 'CDU/CSU': number; SPD: number; AfD: number; 'Grüne': number; FDP: number; Linke: number }[] = [
  { year: '2005', 'CDU/CSU': 35.2, SPD: 34.2, AfD: 0, 'Grüne': 8.1, FDP: 9.8, Linke: 8.7 },
  { year: '2009', 'CDU/CSU': 33.8, SPD: 23.0, AfD: 0, 'Grüne': 10.7, FDP: 14.6, Linke: 11.9 },
  { year: '2013', 'CDU/CSU': 41.5, SPD: 25.7, AfD: 4.7, 'Grüne': 8.4, FDP: 4.8, Linke: 8.6 },
  { year: '2017', 'CDU/CSU': 32.9, SPD: 20.5, AfD: 12.6, 'Grüne': 8.9, FDP: 10.7, Linke: 9.2 },
  { year: '2021', 'CDU/CSU': 24.1, SPD: 25.7, AfD: 10.3, 'Grüne': 14.8, FDP: 11.5, Linke: 4.9 },
  { year: '2025', 'CDU/CSU': 28.5, SPD: 16.4, AfD: 20.8, 'Grüne': 11.6, FDP: 4.3, Linke: 8.8 },
];

/** Voter turnout at federal elections, %. */
export const TURNOUT: { year: string; turnout: number }[] = [
  { year: '2005', turnout: 77.7 }, { year: '2009', turnout: 70.8 }, { year: '2013', turnout: 71.5 },
  { year: '2017', turnout: 76.2 }, { year: '2021', turnout: 76.4 }, { year: '2025', turnout: 82.5 },
];

// ---------- Public finances ----------
/** General government debt (Maastricht), bn € and % of GDP. Source: Bundesbank / Eurostat. */
export const PUBLIC_DEBT: { year: string; debtBn: number; ratio: number }[] = [
  { year: '2012', debtBn: 2227, ratio: 81.1 }, { year: '2013', debtBn: 2213, ratio: 78.7 }, { year: '2014', debtBn: 2216, ratio: 75.7 },
  { year: '2015', debtBn: 2189, ratio: 72.3 }, { year: '2016', debtBn: 2172, ratio: 69.3 }, { year: '2017', debtBn: 2130, ratio: 65.2 },
  { year: '2018', debtBn: 2084, ratio: 61.9 }, { year: '2019', debtBn: 2069, ratio: 59.6 }, { year: '2020', debtBn: 2340, ratio: 68.8 },
  { year: '2021', debtBn: 2495, ratio: 69.0 }, { year: '2022', debtBn: 2562, ratio: 66.1 }, { year: '2023', debtBn: 2623, ratio: 62.9 },
  { year: '2024', debtBn: 2690, ratio: 62.5 },
];

/** Debt by level of government, end 2024, bn €. Source: Destatis (non-public sector creditors). */
export const DEBT_BY_LEVEL: { level: string; debtBn: number }[] = [
  { level: 'Bund', debtBn: 1732 }, { level: 'Länder', debtBn: 607 }, { level: 'Gemeinden', debtBn: 169 }, { level: 'Sozialversicherung', debtBn: 0.04 },
];

/** Government debt ratios in the EU, % of GDP, 2024. Source: Eurostat. */
export const DEBT_PEERS: { country: string; ratio: number }[] = [
  { country: 'Germany', ratio: 62.5 }, { country: 'Netherlands', ratio: 43.3 }, { country: 'Austria', ratio: 81.8 },
  { country: 'France', ratio: 113.0 }, { country: 'Spain', ratio: 101.8 }, { country: 'Italy', ratio: 135.3 },
  { country: 'Poland', ratio: 55.3 }, { country: 'Euro area', ratio: 87.4 },
];

/** Federal budget 2025 by departmental plan, bn €. Source: Bundeshaushalt (Soll). */
export const FEDERAL_BUDGET: { item: string; bn: number; group: string }[] = [
  { item: 'Arbeit und Soziales', bn: 190.3, group: 'Social' },
  { item: 'Verteidigung', bn: 62.4, group: 'Security' },
  { item: 'Verkehr', bn: 38.3, group: 'Infrastructure' },
  { item: 'Bundesschuld (Zinsen)', bn: 34.2, group: 'Debt service' },
  { item: 'Allgemeine Finanzverwaltung', bn: 29.0, group: 'Other' },
  { item: 'Bildung und Forschung', bn: 22.4, group: 'Future' },
  { item: 'Gesundheit', bn: 19.3, group: 'Social' },
  { item: 'Inneres', bn: 15.2, group: 'Security' },
  { item: 'Familie', bn: 14.2, group: 'Social' },
  { item: 'Wirtschaft und Energie', bn: 10.9, group: 'Future' },
  { item: 'Entwicklung (BMZ)', bn: 10.3, group: 'Foreign' },
  { item: 'Wohnen und Bau', bn: 7.4, group: 'Infrastructure' },
  { item: 'Ernährung und Landwirtschaft', bn: 6.9, group: 'Other' },
  { item: 'Auswärtiges Amt', bn: 5.9, group: 'Foreign' },
];
export const FEDERAL_BUDGET_TOTAL = 502.5;

/** Tax revenue 2024 by tax type, bn €. Source: BMF. */
export const TAX_REVENUE: { tax: string; bn: number }[] = [
  { tax: 'Umsatzsteuer (VAT)', bn: 302.1 }, { tax: 'Lohnsteuer', bn: 248.9 }, { tax: 'Gewerbesteuer', bn: 75.3 },
  { tax: 'Einkommensteuer (veranlagt)', bn: 74.9 }, { tax: 'Körperschaftsteuer', bn: 39.8 }, { tax: 'Energiesteuer', bn: 35.1 },
  { tax: 'Abgeltungsteuer', bn: 20.6 }, { tax: 'Grundsteuer', bn: 15.9 }, { tax: 'Tabaksteuer', bn: 15.6 },
  { tax: 'Solidaritätszuschlag', bn: 12.6 }, { tax: 'Erbschaftsteuer', bn: 10.0 }, { tax: 'Kfz-Steuer', bn: 9.7 },
];
export const TAX_REVENUE_TOTAL = 947.7;

/** Federal fiscal balance, net borrowing bn €. Source: BMF. */
export const NET_BORROWING: { year: string; bn: number }[] = [
  { year: '2017', bn: 0 }, { year: '2018', bn: 0 }, { year: '2019', bn: 0 }, { year: '2020', bn: 130.5 }, { year: '2021', bn: 215.4 },
  { year: '2022', bn: 115.4 }, { year: '2023', bn: 27.2 }, { year: '2024', bn: 33.3 }, { year: '2025', bn: 81.8 },
];

// ---------- Demographics ----------
/** Population in millions at year end. Source: Destatis. */
export const POPULATION_TREND: { year: string; population: number }[] = [
  { year: '2012', population: 80.5 }, { year: '2013', population: 80.8 }, { year: '2014', population: 81.2 }, { year: '2015', population: 82.2 },
  { year: '2016', population: 82.5 }, { year: '2017', population: 82.8 }, { year: '2018', population: 83.0 }, { year: '2019', population: 83.2 },
  { year: '2020', population: 83.2 }, { year: '2021', population: 83.2 }, { year: '2022', population: 84.4 }, { year: '2023', population: 84.7 },
  { year: '2024', population: 83.6 },
];

/** Births, deaths and net migration in thousands. Source: Destatis. */
export const VITAL_STATS: { year: string; births: number; deaths: number; netMigration: number }[] = [
  { year: '2016', births: 792, deaths: 911, netMigration: 500 }, { year: '2017', births: 785, deaths: 932, netMigration: 416 },
  { year: '2018', births: 788, deaths: 955, netMigration: 400 }, { year: '2019', births: 778, deaths: 940, netMigration: 327 },
  { year: '2020', births: 773, deaths: 986, netMigration: 220 }, { year: '2021', births: 795, deaths: 1024, netMigration: 329 },
  { year: '2022', births: 739, deaths: 1066, netMigration: 1462 }, { year: '2023', births: 693, deaths: 1028, netMigration: 663 },
  { year: '2024', births: 677, deaths: 1008, netMigration: 430 },
];

/** Population by age band 2023, millions. Source: Destatis. */
export const AGE_BANDS: { band: string; millions: number }[] = [
  { band: '0–17', millions: 14.3 }, { band: '18–29', millions: 11.4 }, { band: '30–44', millions: 16.4 },
  { band: '45–59', millions: 17.6 }, { band: '60–74', millions: 15.6 }, { band: '75+', millions: 9.4 },
];

// ---------- Housing ----------
/** Building permits and completions for dwellings, thousands. Source: Destatis. */
export const HOUSING_SUPPLY: { year: string; permits: number; completions: number }[] = [
  { year: '2016', permits: 375, completions: 278 }, { year: '2017', permits: 348, completions: 285 }, { year: '2018', permits: 347, completions: 287 },
  { year: '2019', permits: 361, completions: 293 }, { year: '2020', permits: 368, completions: 306 }, { year: '2021', permits: 381, completions: 293 },
  { year: '2022', permits: 354, completions: 295 }, { year: '2023', permits: 260, completions: 294 }, { year: '2024', permits: 216, completions: 252 },
];

/** Asking rents in the seven largest cities, €/m² (new lets, 2024). Source: market reports. */
export const CITY_RENTS: { city: string; rent: number; state: string }[] = [
  { city: 'München', rent: 21.5, state: 'BY' }, { city: 'Berlin', rent: 16.4, state: 'BE' }, { city: 'Frankfurt', rent: 16.3, state: 'HE' },
  { city: 'Stuttgart', rent: 15.4, state: 'BW' }, { city: 'Hamburg', rent: 14.9, state: 'HH' }, { city: 'Köln', rent: 14.2, state: 'NW' },
  { city: 'Düsseldorf', rent: 13.5, state: 'NW' }, { city: 'Leipzig', rent: 9.4, state: 'SN' }, { city: 'Dresden', rent: 9.1, state: 'SN' },
  { city: 'Dortmund', rent: 9.0, state: 'NW' },
];

/** House price index (2015 = 100) and 10-year mortgage rate %. Source: Destatis / Bundesbank. */
export const HOUSE_PRICES: { year: string; index: number; mortgageRate: number }[] = [
  { year: '2016', index: 107.5, mortgageRate: 1.6 }, { year: '2017', index: 114.1, mortgageRate: 1.7 }, { year: '2018', index: 121.7, mortgageRate: 1.8 },
  { year: '2019', index: 128.7, mortgageRate: 1.4 }, { year: '2020', index: 138.7, mortgageRate: 1.2 }, { year: '2021', index: 154.7, mortgageRate: 1.3 },
  { year: '2022', index: 162.9, mortgageRate: 3.0 }, { year: '2023', index: 149.2, mortgageRate: 3.9 }, { year: '2024', index: 147.0, mortgageRate: 3.6 },
];

// ---------- Health ----------
/** Health expenditure, bn € and % of GDP. Source: Destatis. */
export const HEALTH_SPENDING: { year: string; bn: number; ratio: number }[] = [
  { year: '2016', bn: 359, ratio: 11.3 }, { year: '2017', bn: 377, ratio: 11.4 }, { year: '2018', bn: 392, ratio: 11.5 },
  { year: '2019', bn: 415, ratio: 11.8 }, { year: '2020', bn: 441, ratio: 12.9 }, { year: '2021', bn: 474, ratio: 13.1 },
  { year: '2022', bn: 498, ratio: 12.8 }, { year: '2023', bn: 501, ratio: 12.0 },
];

/** Leading causes of death 2023, thousand deaths. Source: Destatis. */
export const CAUSES_OF_DEATH: { cause: string; thousand: number }[] = [
  { cause: 'Cardiovascular disease', thousand: 348 }, { cause: 'Cancer', thousand: 230 }, { cause: 'Respiratory disease', thousand: 69 },
  { cause: 'Mental & behavioural (incl. dementia)', thousand: 68 }, { cause: 'Digestive disease', thousand: 44 },
  { cause: 'Injuries & poisoning', thousand: 47 }, { cause: 'COVID-19', thousand: 26 },
];

/** Life expectancy at birth, years. Source: Destatis. */
export const LIFE_EXPECTANCY: { year: string; women: number; men: number }[] = [
  { year: '2016', women: 83.2, men: 78.3 }, { year: '2017', women: 83.2, men: 78.4 }, { year: '2018', women: 83.3, men: 78.5 },
  { year: '2019', women: 83.4, men: 78.6 }, { year: '2020', women: 83.2, men: 78.4 }, { year: '2021', women: 83.0, men: 78.1 },
  { year: '2022', women: 82.9, men: 78.2 }, { year: '2023', women: 83.3, men: 78.6 },
];

// ---------- Tourism ----------
/** Overnight stays in millions. Source: Destatis. */
export const TOURISM_TREND: { year: string; domestic: number; foreign: number }[] = [
  { year: '2016', domestic: 366, foreign: 81 }, { year: '2017', domestic: 376, foreign: 84 }, { year: '2018', domestic: 390, foreign: 88 },
  { year: '2019', domestic: 406, foreign: 90 }, { year: '2020', domestic: 270, foreign: 32 }, { year: '2021', domestic: 279, foreign: 31 },
  { year: '2022', domestic: 382, foreign: 68 }, { year: '2023', domestic: 406, foreign: 81 }, { year: '2024', domestic: 411, foreign: 85 },
];

/** Foreign overnight stays by origin 2023, millions. Source: Destatis. */
export const TOURISM_ORIGINS: { origin: string; millions: number }[] = [
  { origin: 'Netherlands', millions: 11.9 }, { origin: 'Switzerland', millions: 7.4 }, { origin: 'USA', millions: 7.2 },
  { origin: 'United Kingdom', millions: 5.1 }, { origin: 'Austria', millions: 4.6 }, { origin: 'Poland', millions: 4.2 },
  { origin: 'France', millions: 3.6 }, { origin: 'Denmark', millions: 3.5 }, { origin: 'Italy', millions: 3.3 }, { origin: 'Belgium', millions: 3.2 },
];

// ---------- Digital ----------
/** Fixed broadband availability for households, %. Source: Gigabit-Grundbuch / BNetzA. */
export const BROADBAND_TREND: { year: string; gigabit: number; fiber: number; fiveG: number }[] = [
  { year: '2019', gigabit: 43, fiber: 9, fiveG: 0 }, { year: '2020', gigabit: 59, fiber: 12, fiveG: 18 }, { year: '2021', gigabit: 62, fiber: 15, fiveG: 53 },
  { year: '2022', gigabit: 70, fiber: 20, fiveG: 79 }, { year: '2023', gigabit: 74, fiber: 28, fiveG: 89 }, { year: '2024', gigabit: 76, fiber: 36, fiveG: 92 },
];

/** Fibre (FTTH/B) share of fixed broadband subscriptions, %, 2024. Source: OECD. */
export const FIBER_PEERS: { country: string; share: number }[] = [
  { country: 'Spain', share: 87 }, { country: 'Sweden', share: 80 }, { country: 'France', share: 71 }, { country: 'Poland', share: 54 },
  { country: 'OECD average', share: 43 }, { country: 'Netherlands', share: 32 }, { country: 'Italy', share: 25 }, { country: 'Germany', share: 12 },
  { country: 'Austria', share: 11 },
];

/** Digital indicators, % of population / enterprises 2024. Source: Eurostat DESI. */
export const DIGITAL_INDICATORS: { indicator: string; germany: number; eu: number }[] = [
  { indicator: 'At least basic digital skills', germany: 52, eu: 56 },
  { indicator: 'e-Government users', germany: 62, eu: 75 },
  { indicator: 'Enterprises using cloud', germany: 47, eu: 45 },
  { indicator: 'Enterprises using AI', germany: 20, eu: 14 },
  { indicator: 'Online banking', germany: 67, eu: 67 },
  { indicator: 'Households with gigabit take-up', germany: 6, eu: 22 },
];

// ---------- Climate ----------
/** Germany annual mean temperature, °C (1961–1990 reference: 8.2 °C). Source: DWD. */
export const ANNUAL_TEMPERATURE: { year: string; temperature: number }[] = [
  { year: '2005', temperature: 9.0 }, { year: '2006', temperature: 9.5 }, { year: '2007', temperature: 9.9 }, { year: '2008', temperature: 9.5 },
  { year: '2009', temperature: 9.2 }, { year: '2010', temperature: 7.8 }, { year: '2011', temperature: 9.6 }, { year: '2012', temperature: 9.1 },
  { year: '2013', temperature: 8.7 }, { year: '2014', temperature: 10.3 }, { year: '2015', temperature: 9.9 }, { year: '2016', temperature: 9.5 },
  { year: '2017', temperature: 9.6 }, { year: '2018', temperature: 10.5 }, { year: '2019', temperature: 10.3 }, { year: '2020', temperature: 10.4 },
  { year: '2021', temperature: 9.2 }, { year: '2022', temperature: 10.5 }, { year: '2023', temperature: 10.6 }, { year: '2024', temperature: 10.9 },
];
export const CLIMATE_REFERENCE_C = 8.2;

/** Monthly climate normals 1991–2020 for Germany. Source: DWD. */
export const CLIMATE_NORMALS: { month: string; temperature: number; precipitation: number; sunshine: number }[] = [
  { month: 'Jan', temperature: 0.9, precipitation: 65, sunshine: 52 }, { month: 'Feb', temperature: 1.5, precipitation: 53, sunshine: 76 },
  { month: 'Mar', temperature: 4.6, precipitation: 57, sunshine: 127 }, { month: 'Apr', temperature: 9.0, precipitation: 45, sunshine: 183 },
  { month: 'May', temperature: 13.1, precipitation: 70, sunshine: 213 }, { month: 'Jun', temperature: 16.4, precipitation: 76, sunshine: 216 },
  { month: 'Jul', temperature: 18.3, precipitation: 87, sunshine: 226 }, { month: 'Aug', temperature: 18.0, precipitation: 78, sunshine: 210 },
  { month: 'Sep', temperature: 13.8, precipitation: 65, sunshine: 157 }, { month: 'Oct', temperature: 9.4, precipitation: 63, sunshine: 108 },
  { month: 'Nov', temperature: 4.8, precipitation: 63, sunshine: 55 }, { month: 'Dec', temperature: 1.8, precipitation: 71, sunshine: 42 },
];

/** Greenhouse gas emissions, Mt CO₂e. Source: Umweltbundesamt. Target: −65 % vs 1990 by 2030 (438 Mt). */
export const GHG_EMISSIONS: { year: string; mt: number }[] = [
  { year: '1990', mt: 1251 }, { year: '2000', mt: 1045 }, { year: '2010', mt: 932 }, { year: '2015', mt: 904 }, { year: '2018', mt: 852 },
  { year: '2019', mt: 797 }, { year: '2020', mt: 731 }, { year: '2021', mt: 760 }, { year: '2022', mt: 750 }, { year: '2023', mt: 674 }, { year: '2024', mt: 649 },
];

// ---------- Energy structure ----------
/** Installed net generation capacity, GW, end 2024. Source: Energy-Charts / BNetzA. */
export const INSTALLED_CAPACITY: { source: string; gw: number; kind: 'Renewable' | 'Fossil' | 'Storage' }[] = [
  { source: 'Solar', gw: 99.3, kind: 'Renewable' }, { source: 'Wind onshore', gw: 63.5, kind: 'Renewable' }, { source: 'Gas', gw: 36.7, kind: 'Fossil' },
  { source: 'Hard coal', gw: 15.6, kind: 'Fossil' }, { source: 'Lignite', gw: 15.2, kind: 'Fossil' }, { source: 'Battery storage', gw: 12.1, kind: 'Storage' },
  { source: 'Pumped hydro', gw: 9.9, kind: 'Storage' }, { source: 'Wind offshore', gw: 9.2, kind: 'Renewable' }, { source: 'Biomass', gw: 9.1, kind: 'Renewable' },
  { source: 'Hydro', gw: 6.5, kind: 'Renewable' },
];

/** Renewable share of gross electricity consumption, %. Source: AGEE-Stat / UBA. */
export const RENEWABLE_SHARE_TREND: { year: string; share: number }[] = [
  { year: '2010', share: 17.1 }, { year: '2012', share: 23.6 }, { year: '2014', share: 27.4 }, { year: '2016', share: 31.6 }, { year: '2018', share: 37.6 },
  { year: '2019', share: 42.0 }, { year: '2020', share: 45.2 }, { year: '2021', share: 41.5 }, { year: '2022', share: 46.3 }, { year: '2023', share: 52.5 }, { year: '2024', share: 54.4 },
];

/** Neighbours with a physical interconnection, as named by Energy-Charts. */
export const NEIGHBOURS = ['Austria', 'Belgium', 'Czech Republic', 'Denmark', 'France', 'Luxembourg', 'Netherlands', 'Norway', 'Poland', 'Sweden', 'Switzerland'];
