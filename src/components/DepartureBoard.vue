<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTimetableStore } from '../stores/timetableStore'
import { getTransportMeta } from '../utils/transport'

const store = useTimetableStore()
const router = useRouter()
const route = useRoute()

const apiKeyConfigured = Boolean(import.meta.env.VITE_GOLEMIO_API_KEY)
const isFullscreenRoute = computed(() => route.name === 'fullscreen')
const isInitialLoad = computed(
  () => store.departuresLoading && !store.departures.length && store.hasSelection
)
const lastUpdatedLabel = computed(() =>
  store.departuresLoading && store.departures.length
    ? 'Updating…'
    : store.lastUpdated
      ? formatTime(store.lastUpdated)
      : '—'
)

const formattedDepartures = computed(() =>
  store.departures.map((departure) => {
    const transportMeta = getTransportMeta(departure.transportKey || departure.vehicleType)

    return {
      ...departure,
      transportMeta,
      plannedLabel: formatTime(departure.plannedTime),
      realtimeLabel: formatTime(departure.realtimeTime),
      status: formatStatus(departure),
      etaLabel: formatEta(departure.minutesUntil),
    }
  })
)

function formatTime(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatStatus(departure) {
  if (typeof departure.delayMinutes === 'number' && departure.delayMinutes !== 0) {
    return departure.delayMinutes > 0
      ? `+${departure.delayMinutes} min`
      : `${departure.delayMinutes} min`
  }

  if (departure.realtimeTime && !departure.plannedTime) {
    return 'live'
  }

  return 'on time'
}

const refreshBoard = () => {
  store.fetchDepartures()
}

const openFullscreen = () => {
  if (!store.selectedStop) {
    return
  }

  const url = router.resolve({
    name: 'fullscreen',
    params: { node: store.selectedStop.node },
  }).href

  window.open(url, '_blank', 'noopener')
}

function formatEta(value) {
  if (value === null || value === undefined) {
    return '—'
  }

  if (typeof value === 'string') {
    return value.includes('min') ? value : `${value}`
  }

  if (value <= 0) {
    return '<1 min'
  }

  return `${value} min`
}
</script>

<template>
  <section class="panel board-panel">
    <header class="panel-header">
      <div>
        <p class="eyebrow">Departure board</p>
        <h2>
          {{
            store.selectedStop
              ? store.selectedStop.altName || store.selectedStop.displayName
              : 'Awaiting stop selection'
          }}
        </h2>
        <p v-if="store.selectedStop" class="stop-meta">
          {{
            store.selectedStop.municipality
              ? `${store.selectedStop.municipality} · Node ${store.selectedStop.node}`
              : `Node ${store.selectedStop.node}`
          }}
        </p>
      </div>

      <div class="board-actions">
        <button
          class="ghost"
          type="button"
          :disabled="!store.hasSelection || store.departuresLoading"
          @click="refreshBoard"
        >
          Refresh
        </button>
        <button
          class="ghost"
          type="button"
          :disabled="!store.hasSelection"
          @click="store.clearSelection"
        >
          Clear stop
        </button>
        <button
          v-if="!isFullscreenRoute"
          class="ghost"
          type="button"
          :disabled="!store.hasSelection"
          @click="openFullscreen"
        >
          Fullscreen
        </button>
      </div>
    </header>

    <div class="board-surface">
      <div v-if="!store.hasSelection" class="board-placeholder">
        <p>Select any stop to load live departures.</p>
        <p class="caption">
          Data sourced from PID open data + Golemio APIs.
        </p>
      </div>

      <div v-else-if="isInitialLoad" class="board-placeholder">
        <p>Fetching live departures…</p>
      </div>

      <div
        v-else-if="store.departuresError"
        class="board-placeholder board-error"
        role="alert"
      >
        <p>{{ store.departuresError }}</p>
        <p v-if="!apiKeyConfigured" class="caption">
          Provide a valid token in <code>.env</code> as <code>VITE_GOLEMIO_API_KEY</code>.
        </p>
      </div>

      <table v-else class="departure-grid" aria-live="polite">
        <thead>
          <tr>
            <th scope="col">Mode</th>
            <th scope="col">Line</th>
            <th scope="col">Destination</th>
            <th scope="col">Arrives</th>
            <th scope="col">Platform</th>
            <th scope="col">Planned</th>
            <th scope="col">Live</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="departure in formattedDepartures" :key="departure.id">
            <td>
              <span
                class="transport-chip"
                :style="{ '--chip-color': departure.transportMeta.color }"
                :aria-label="departure.transportMeta.label"
              >
                {{ departure.transportMeta.code }}
              </span>
            </td>
            <td class="line-cell">
              <span class="line-code">{{ departure.line }}</span>
            </td>
            <td>{{ departure.destination }}</td>
            <td class="eta-cell">
              {{ departure.etaLabel }}
            </td>
            <td>{{ departure.platform }}</td>
            <td>{{ departure.plannedLabel }}</td>
            <td>{{ departure.realtimeLabel }}</td>
            <td :class="{ delayed: departure.status.includes('+') }">
              {{ departure.status }}
            </td>
          </tr>
          <tr v-if="!formattedDepartures.length">
            <td colspan="8" class="board-placeholder">
              No departures are scheduled in the next hour.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer class="board-footer">
      <p>
        Last updated:
        {{ lastUpdatedLabel }}
      </p>
      <p>
        Source:
        <a
          class="link"
          href="https://pid.cz/en/opendata/"
          target="_blank"
          rel="noreferrer"
          >PID open data</a
        >
        &middot;
        <a
          class="link"
          href="https://api.golemio.cz/pid/docs/openapi/"
          target="_blank"
          rel="noreferrer"
          >Golemio API</a
        >
      </p>
    </footer>
  </section>
</template>

