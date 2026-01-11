# CLAUDE.md - AI Assistant Guide for timetable.guide

This document provides context for AI assistants working with this codebase.

## Project Overview

**timetable.guide** is a real-time Prague public transport timetable application. It displays live departure information with a retro "black-and-green phosphor display" aesthetic, mimicking the actual departure boards in Prague metro and bus stations.

**Live site**: https://timetable.guide/

## Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| Framework | Vue 3 (Composition API) | 3.5.24 |
| Build Tool | Vite | 7.2.2 |
| State Management | Pinia | 3.0.4 |
| Routing | Vue Router | 4.6.3 |
| Styling | Tailwind CSS | 4.1.17 |
| Maps | Leaflet + MarkerCluster | 1.9.4 |
| HTTP Client | Axios | 1.13.2 |
| i18n | Vue-i18n | 10.0.8 |
| Utilities | @vueuse/core | 14.0.0 |
| Hosting | Vercel (serverless functions) | - |

## Project Structure

```
time-table/
├── src/
│   ├── main.js                    # App entry point
│   ├── App.vue                    # Root component
│   ├── style.css                  # Global styles + Tailwind
│   ├── i18n.js                    # Internationalization config
│   │
│   ├── views/
│   │   ├── HomeView.vue           # Main layout (search + map + board)
│   │   └── FullscreenBoardView.vue # Kiosk mode with auto-refresh
│   │
│   ├── components/
│   │   ├── StopSearch.vue         # Instant search with geolocation
│   │   ├── StopMap.vue            # Leaflet map with clustered markers
│   │   ├── DepartureBoard.vue     # Live departures display
│   │   ├── VehicleTracker.vue     # Real-time vehicle tracking
│   │   ├── ThemeToggle.vue        # Dark/light mode switch
│   │   └── LanguageSelector.vue   # i18n locale switcher
│   │
│   ├── stores/
│   │   ├── timetableStore.js      # Core state (stops, departures, vehicle tracking)
│   │   └── themeStore.js          # Theme preference persistence
│   │
│   ├── router/
│   │   └── index.js               # Route definitions with dynamic meta
│   │
│   ├── utils/
│   │   └── transport.js           # Transport types, colors, SVG icons
│   │
│   └── locales/
│       ├── en.json                # English translations
│       ├── cs.json                # Czech translations
│       └── uk.json                # Ukrainian translations
│
├── api/                           # Vercel serverless functions
│   ├── golemio.js                 # CORS proxy for Golemio API
│   └── pid-stops.js               # CORS proxy for PID stops
│
├── public/
│   ├── manifest.json              # PWA manifest
│   ├── robots.txt                 # SEO config
│   └── sitemap.xml                # Sitemap
│
├── index.html                     # Entry HTML with meta tags
├── vite.config.js                 # Vite configuration
├── vercel.json                    # Vercel deployment config
└── package.json                   # Dependencies and scripts
```

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (port 5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Setup

Create a `.env` file in the project root:

```bash
# Required for live departures (get from pid.cz/en/opendata)
VITE_GOLEMIO_API_KEY=your_token_here

# Optional: API URL overrides
VITE_GOLEMIO_API_URL=https://api.golemio.cz/v2/pid
VITE_STOPS_API_URL=https://data.pid.cz/stops/json/stops.json
```

**Note**: The API key is only needed in development. In production (Vercel), the `GOLEMIO_API_KEY` environment variable is injected server-side by the serverless functions.

## Key Architecture Patterns

### State Management (Pinia)

The main store is `src/stores/timetableStore.js`:

- **`stops`**: Array of ~2000 Prague stops (cached in sessionStorage for 24h)
- **`selectedStop`**: Currently selected stop object
- **`departures`**: Live departures for selected stop
- **`trackedVehicle`**: Vehicle position data for tracking view

Key actions:
- `fetchStops()` - Loads stop catalog with caching
- `selectStop(stop)` - Selects stop and fetches departures
- `fetchDepartures()` - Gets real-time departures from Golemio API
- `fetchVehiclePosition(tripId)` - Tracks vehicle with fallback strategies

### API Data Normalization

The Golemio API returns inconsistent data formats. The store includes extensive normalization:

```javascript
// Example: timestamp can be in multiple locations
const time = departure.arrival_timestamp?.predicted
  || departure.departure_timestamp?.predicted
  || departure.arrival_timestamp?.scheduled
  // ... 10+ fallback paths
```

### Request Cancellation

Uses `AbortController` to prevent race conditions when rapidly switching stops:

```javascript
if (this.departuresAbortController) {
  this.departuresAbortController.abort()
}
this.departuresAbortController = new AbortController()
```

### CORS Handling

- **Development**: Vite proxy in `vite.config.js` handles CORS
- **Production**: Vercel serverless functions in `/api/` directory proxy requests

## Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | HomeView | Main app with search, map, and board |
| `/stops/:node` | HomeView | Specific stop selected |
| `/stops/:node/fullscreen` | FullscreenBoardView | Kiosk mode |
| `/stops/:node/track/:tripId` | HomeView + VehicleTracker | Vehicle tracking |

## Styling Conventions

### Theme System

- Dark mode is default (retro phosphor green aesthetic)
- Light mode available via toggle
- Theme stored in localStorage, applied via `dark` class on `<html>`

### Transport Colors

CSS variables define transport type colors in `src/style.css`:

```css
--metro-accent: #dc2626;      /* Metro (red) */
--tram-accent: #ea580c;       /* Tram (orange) */
--bus-accent: #0284c7;        /* Bus (blue) */
--trolleybus-accent: #16a34a; /* Trolleybus (green) */
--train-accent: #7c3aed;      /* Train (purple) */
--ferry-accent: #0891b2;      /* Ferry (cyan) */
--funicular-accent: #ca8a04;  /* Funicular (yellow) */
```

Metro lines have specific colors (A=green, B=yellow, C=red).

### Tailwind Usage

- Utility classes for layout and spacing
- Custom CSS for the retro departure board aesthetic
- Responsive breakpoint at 1100px (`control-column` / `board-column` layout)

## Component Patterns

### Script Setup

All components use Vue 3 Composition API with `<script setup>`:

```vue
<script setup>
import { ref, computed, onMounted } from 'vue'
import { useTimetableStore } from '@/stores/timetableStore'

const store = useTimetableStore()
const localState = ref(null)
</script>
```

### i18n Usage

```vue
<template>
  <span>{{ $t('common.loading') }}</span>
  <i18n-t keypath="departures.delayMinutes" tag="span">
    <template #minutes>{{ delay }}</template>
  </i18n-t>
</template>
```

Translation keys follow namespace pattern: `header.title`, `common.loading`, `departures.noData`.

## Common Tasks

### Adding a New Translation Key

1. Add key to `src/locales/en.json`
2. Add translations to `cs.json` and `uk.json`
3. Use `$t('namespace.key')` in templates

### Adding a New Transport Type

1. Add to `TRANSPORT_META` in `src/utils/transport.js`
2. Add CSS variable in `src/style.css`
3. Update `resolveTransportKey()` if needed for GTFS mapping

### Modifying API Calls

API integration is in `src/stores/timetableStore.js`. Key endpoints:

- **Stops**: `/api/pid-stops` (production) or `/pid-stops/stops/json/stops.json` (dev)
- **Departures**: `/api/golemio/departureboards`
- **Vehicle Position**: `/api/golemio/vehiclepositions`

### Adding a New Route

1. Add route in `src/router/index.js`
2. Create view component in `src/views/`
3. Update route meta for SEO (title, description)

## Data Sources

| Source | Description | Update Frequency |
|--------|-------------|------------------|
| [PID Open Data](https://pid.cz/en/opendata/) | Stop catalog (~2000 stops) | Daily ~04:00 CET |
| [Golemio API](https://api.golemio.cz/pid/docs/openapi/) | Live departures, vehicle positions | Real-time |

## Caching Strategy

- **Stop list**: SessionStorage with 24-hour expiry + version check
- **Departures**: HTTP cache header 30s (serverless function)
- **Vehicle positions**: HTTP cache header 10s (serverless function)

## Known Patterns and Gotchas

1. **API inconsistency**: Golemio API responses vary in structure. Always check normalization functions when debugging data issues.

2. **CORS in development**: If you see CORS errors, ensure you're running `npm run dev` (not opening files directly).

3. **No tests**: Project currently has no automated tests. Manual testing recommended.

4. **Large components**: `VehicleTracker.vue` (61KB) and `DepartureBoard.vue` (18KB) handle complex logic. Consider the data flow carefully when modifying.

5. **Stop data size**: Raw PID data is ~20MB. Serverless function optimizes to ~2-3MB.

6. **AbortController cleanup**: Always abort previous requests when starting new ones to prevent race conditions.

## Deployment

The project is deployed on Vercel:

1. Push to main branch triggers deployment
2. Serverless functions in `/api/` handle API proxying
3. Set `GOLEMIO_API_KEY` in Vercel environment variables
4. SPA routing handled by `vercel.json` rewrites

## File Size Reference

Key files by size for context:

- `VehicleTracker.vue`: 61KB (vehicle tracking with map)
- `timetableStore.js`: 20KB (main state management)
- `DepartureBoard.vue`: 18KB (departure display)
- `StopMap.vue`: 12KB (Leaflet map)
- `StopSearch.vue`: 9KB (search component)
- `style.css`: 1467 lines (global styles)
