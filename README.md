# Prague PID Departure Board

A single-page Vue 3 application that combines the PID stop list with the Golemio departure board endpoint to recreate the classic black-and-green displays you see in Prague bus and metro stations. Users can locate a stop through instant search or pick it directly from an interactive map, then view upcoming departures with live delay indicators.

## Tech Stack

- [Vue 3](https://vuejs.org/) + [Vite](https://vite.dev/) for the UI
- [Pinia](https://pinia.vuejs.org/) for state management
- [Leaflet](https://leafletjs.com/) for stop selection on top of OpenStreetMap tiles
- [PID Open Data](https://pid.cz/en/opendata/) stop catalog + [Golemio API](https://api.golemio.cz/pid/docs/openapi/) departure boards as data sources

## Getting Started

```bash
npm install
```

Create a `.env` (or `.env.local`) file with your Golemio access token. The API key is required for live departures but you can still explore the UI and stop search without it.

```bash
VITE_GOLEMIO_API_KEY=your_token_here
# optional override if you proxy the API
VITE_GOLEMIO_API_URL=https://api.golemio.cz/v2/pid
# optional override for the stop list endpoint
VITE_STOPS_API_URL=https://data.pid.cz/stops/json/stops.json
```

> You can request a free PID/Golemio API key through the contacts listed on [pid.cz/en/opendata](https://pid.cz/en/opendata/).

Run the dev server:

```bash
npm run dev
```

Create a production bundle:

```bash
npm run build
npm run preview
```

## Avoiding CORS issues

The PID stop list is hosted on `data.pid.cz` without CORS headers, which means browsers will block direct cross-origin requests. The Vite dev server proxies around this automatically:

- `/pid-stops/...` → `https://data.pid.cz/...`
- `/golemio/...` → `https://api.golemio.cz/...`

When running `npm run dev` you do not need to configure anything—requests to both datasets go through the proxy. For production deployments you have two options:

1. **Keep using a proxy** (recommended): host the built assets behind a reverse proxy (Nginx, Cloudflare Worker, Netlify function, etc.) that forwards `/pid-stops` and `/golemio` to their respective origins while injecting your API key server-side.
2. **Mirror the stop list**: fetch `https://data.pid.cz/stops/json/stops.json` during your CI/deploy step and serve it from the same origin as the app (the dataset is regenerated each morning around 04:00 CET).

Without one of these approaches the browser will keep throwing CORS errors because the remote servers do not permit direct cross-origin reads.

## Features

- **Dual stop picker** – instant-search across all PID stop groups plus a Leaflet map with tappable markers.
- **Stop-based routing** – every selected node updates the URL (`/NODE_ID`), so sharing or refreshing keeps the same departure board.
- **Fullscreen wallboard** – open any node in `/fullscreen/NODE_ID` for kiosk mode with auto-refresh every 5 s.
- **Retro board styling** – black glass background, phosphor-green monospace text, and column layout similar to real Prague departure boards.
- **Live departures** – planned vs. live timestamps, delay deltas, and quick manual refresh.
- **Helpful fallbacks** – clear guidance when the stop catalog fails to load or when the API key is missing/invalid.
