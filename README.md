# Deutschland-Dashboard

A dense, dark-mode command center for Germany: power grid, weather and official warnings, Autobahn and rail,
river gauges, air quality, markets and macro, society, politics and public finances.

## Architecture

```
app/
  page.tsx, energy/, weather/, mobility/, rivers/, air/, economy/, society/, politics/   one dashboard tab each
  states/      choropleth map, state comparison, drill-down dialog
  system/      network-health panel
  api/dash/[view]     manifest + datasets for a tab   (?h=24h|7d|30d|1y&state=XX)
  api/states          per-Bundesland rows (curated + live columns)
  api/health          status of every feed
  api/stream          Server-Sent Events: ticker + feed health every 5 s
  api/ticker          JSON polling fallback for the stream
  api/export/[view]   per-dataset download (?format=csv|json&dataset=key)
components/
  shell/   app frame (sidebar, header controls, Berlin clock), ticker bar, command palette, status badges
  dash/    DashView - polls a tab endpoint and renders it with the dashboard kit (components/viz, ECharts runtime)
  states/  SVG choropleth + comparison table
  system/  feed registry
hooks/     use-poll (interval polling), use-live-stream (SSE with polling fallback), use-settings (global controls)
lib/
  domain/types.ts   all TypeScript schemas
  feeds/            core.ts (registry, fetch, cache, fallback) + one adapter per domain
  sim/              deterministic simulators (daily/seasonal curves + seeded noise)
  data/             curated structural datasets (states, national)
  geo/              Bundesland outlines and point-in-state lookup
  views.ts          builds each tab (tiles + data) from the feeds
```

### Feed lifecycle

Every feed goes through `loadFeed()` in `lib/feeds/core.ts`:

1. Serve from the in-memory cache while fresh.
2. Otherwise call the upstream API (with a timeout).
3. On failure: serve the last good value as **STALE** (from memory, or from the database if one is configured).
4. If no good value exists: serve the simulator as **SIMULATED** and keep the upstream error text.
5. **ERROR** is shown only if neither is possible.

Each attempt is recorded (latency, success) and shown on the *Network health* tab.

## Data sources

| Feed | Source | Type |
| --- | --- | --- |
| Generation mix, day-ahead price, CO2 signal, cross-border flows | Energy-Charts API (Fraunhofer ISE) | live |
| Grid load | SMARD (Bundesnetzagentur) | live |
| Weather now / history per state capital | Bright Sky (DWD open data) | live |
| Weather warnings | Bright Sky alerts (DWD) | live |
| Civil-protection warnings | NINA (BBK) via bund.dev | live |
| Roadworks, closures, warnings | Autobahn API (Autobahn GmbH) | live |
| River gauges and history | PEGELONLINE (WSV) | live |
| Air quality stations and history | Umweltbundesamt air data API | live |
| EUR FX rates | Frankfurter (ECB reference rates) | live |
| Equity indices | Yahoo Finance chart endpoint (unofficial, may change) | live |
| Inflation, unemployment, GDP | public statistics APIs (see `lib/feeds/economy.ts`) | live |
| Rail punctuality | no open API - modelled | simulated |
| ifo business climate, insolvencies | no open API - modelled | simulated |
| Demographics, politics, public finances, digital, housing, health, tourism | curated snapshot, rounded reference values, **not auto-updating** | static |

All APIs are keyless. Energy-Charts rate-limits bursts (HTTP 429); the affected chart then falls back automatically.

## Live vs simulated

- Status badges above every tab show `LIVE`, `SIMULATED`, `STALE` or `ERROR` plus the last update (Europe/Berlin).
- Simulated values are deterministic per time bucket, so all users see the same numbers.
- `DD_FORCE_SIM=all` (or a comma-separated list of feed ids) forces simulation, e.g. for demos or tests.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | no | PostgreSQL URL. When set, last-good snapshots and feed checks are persisted. Without it the app runs memory-only. |
| `DD_FORCE_SIM` | no | Force simulation for all or selected feeds. |

## Local development

```bash
npm install
npx prisma generate
npm run dev      # http://localhost:3000
npm run build
```

If you set `DATABASE_URL`, run `npx prisma db push` once.

## Deploy to Vercel via GitHub

1. Replace the files in your GitHub repository with the contents of this folder. At minimum, replace
   `package.json`, `package-lock.json`, `next.config.js` and `vercel.json`, and delete `.npmrc` if it is there.
2. On vercel.com, import the repository (or simply push: Vercel redeploys automatically).
3. Leave all settings on default. `vercel.json` sets install (`npm install --legacy-peer-deps`) and build (`npm run build`).
   If you overrode Install/Build Command in the Vercel project settings, switch them back to default.
4. No environment variables are required. Optional: `DATABASE_URL` (then run `npx prisma db push` once).

Notes:

- The dependency list is minimal and conflict-free with React 19, so `npm install` works even without `--legacy-peer-deps`.
- `motion-dom` and `motion-utils` are pinned on purpose; newer versions break framer-motion 12.23.12.
- The SSE endpoint closes after about 50 s and the browser reconnects, which keeps it within serverless limits.
- Tested in a clean copy: `npm ci`, `npx tsc --noEmit`, `npm run build` (without `DATABASE_URL`) and `next start`
  with all pages and APIs returning 200. A real Vercel deployment has not been run from this workspace.
