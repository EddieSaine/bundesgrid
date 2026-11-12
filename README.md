# Deutschland-Dashboard

A dense, dark-mode command center for Germany. It combines live open data – power grid, weather and official
warnings, Autobahn traffic, river gauges, air quality, markets and macroeconomics – with curated structural data
on society, politics and public finances, broken down by Bundesland.

<img width="1673" height="903" alt="image" src="https://github.com/user-attachments/assets/0a49162a-b10c-43b4-b055-0f3eee5d725d" />


## Features

- **11 views:** Command Center, Map & Bundesländer, Energy Grid, Weather & Warnings, Mobility, Rivers & Shipping,
  Air Quality, Economy & Markets, Society, Politics & Finances, Network Health
- **Live updates:** a Server-Sent Events stream feeds the ticker and feed status every 5 s; if the stream drops,
  the app falls back to polling. Dashboards refresh on a configurable interval
- **Status for every feed:** `LIVE`, `SIMULATED`, `STALE` or `ERROR`, plus the time of the last update (Europe/Berlin)
- **Choropleth map** of the 16 Bundesländer with a metric selector, a drill-down dialog and side-by-side comparison of up to four states
- **Global controls:** time horizon (24h / 7d / 30d / 1y where the data allows), refresh interval, state filter,
  and a command palette (`Ctrl/Cmd + K`)
- **Export** of every dataset as CSV or JSON

## Tech stack

Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS, Framer Motion, Lucide icons, Zustand,
Apache ECharts (charts), and Prisma (optional PostgreSQL persistence).

## Getting started

Requirements: Node.js 22 and npm.

```bash
npm install        # also runs `prisma generate`
npm run dev        # http://localhost:3000
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (generates the Prisma client first) |
| `npm run start` | Serve the production build |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run lint` | ESLint |

No API keys are needed. Every data source is public and keyless.

## Environment variables

Both are optional. See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. When set, the last good value of each feed and its health checks are persisted, which shares state between server instances. Run `npx prisma db push` once to create the tables. Without it, the app keeps everything in memory. |
| `DD_FORCE_SIM` | Forces the simulator, e.g. for demos or tests. Accepts `all` (or `1` / `true`) for every feed, or a comma-separated list of feed IDs from `lib/feeds/core.ts`. |

## Architecture

```
app/
  page.tsx + energy/ weather/ mobility/ rivers/ air/ economy/ society/ politics/   one dashboard view each
  states/              choropleth map, state comparison, drill-down dialog
  system/              network health
  api/dash/[view]      tiles and datasets for a view     (?h=24h|7d|30d|1y&state=XX)
  api/states           one row per Bundesland (curated + live columns)
  api/health           status of every feed
  api/stream           Server-Sent Events: ticker + feed health
  api/ticker           JSON polling fallback for the stream
  api/export/[view]    dataset download              (?format=csv|json&dataset=key)
components/
  shell/   app frame (sidebar, header controls, Berlin clock), ticker bar, command palette, status badges
  dash/    DashView: polls a view endpoint and renders it
  viz/     React wrapper around the chart runtime in public/abacus-viz (built on ECharts)
  states/  SVG choropleth + comparison table
  system/  feed registry and health
hooks/     use-poll (interval polling), use-live-stream (SSE with polling fallback), use-settings (global controls)
lib/
  domain/types.ts   TypeScript schemas
  feeds/            core.ts (registry, fetching, cache, fallback) + one adapter per domain
  sim/              deterministic simulators (daily/seasonal curves + seeded noise)
  data/             curated datasets (states, national)
  geo/              Bundesland outlines and point-in-state lookup
  views.ts          builds each view from the feeds
prisma/schema.prisma   optional persistence (feed snapshots, feed checks)
```

### Feed lifecycle

Every feed goes through `loadFeed()` in `lib/feeds/core.ts`:

1. Serve from the in-memory cache while it is fresh.
2. Otherwise call the upstream API, with a timeout.
3. On failure, serve the last good value as **STALE** (from memory, or from the database if one is configured).
4. If there is no good value, serve the simulator as **SIMULATED** and keep the upstream error message.
5. **ERROR** appears only if neither is possible.

Every upstream attempt is recorded (latency, success) and shown in the *Network Health* view. The simulators use
seeded noise, so they are deterministic: two users at the same moment see the same numbers.

## Data sources

| Data | Source | Type |
| --- | --- | --- |
| Generation mix, day-ahead price, CO₂ intensity, cross-border flows | [Energy-Charts API](https://api.energy-charts.info) (Fraunhofer ISE) | live |
| Grid load (cross-check) | [SMARD](https://www.smard.de) (Bundesnetzagentur) | live |
| Weather in the 16 state capitals, hourly history | [Bright Sky](https://brightsky.dev) (DWD open data) | live |
| Official weather warnings | Bright Sky (DWD warnings) | live |
| Civil-protection warnings | [NINA](https://nina.api.bund.dev) (BBK, warnung.bund.de) | live |
| Autobahn roadworks, closures, warnings | [Autobahn API](https://autobahn.api.bund.dev) (Autobahn GmbH) | live |
| Water levels and history at key gauges | [PEGELONLINE](https://www.pegelonline.wsv.de) (WSV) | live |
| Air quality per station, national 24 h | [Umweltbundesamt](https://www.umweltbundesamt.de/daten/luft/luftdaten) air data API | live |
| EUR reference rates | [Frankfurter](https://frankfurter.dev) (ECB) | live |
| DAX family, Euro Stoxx 50 | Yahoo Finance chart endpoint (unofficial, delayed, may change without notice) | live |
| HICP inflation | [ECB Data Portal](https://data.ecb.europa.eu) | live |
| Unemployment rate, real GDP | [Eurostat](https://ec.europa.eu/eurostat) | live |
| Rail punctuality | no open API – modelled | simulated |
| ifo Business Climate, corporate insolvencies | no open API – modelled | simulated |
| Demographics, politics, public finances, digital infrastructure, housing, health, tourism | curated snapshot of rounded reference values, **not updated automatically** | static |

All data belongs to its respective providers and is subject to their terms of use. Energy-Charts limits
burst requests (HTTP 429); affected charts then fall back automatically.

## Disclaimer

This is an independent project, not affiliated with any of the institutions listed above. Simulated and
curated values are labelled as such in the UI and are not official statistics.
