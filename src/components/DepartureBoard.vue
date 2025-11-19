<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTimetableStore } from '../stores/timetableStore'
import { getTransportMeta } from '../utils/transport'

const REFRESH_INTERVAL = 5000
const AUTO_REFRESH_KEY = 'timetable_auto_refresh'

const store = useTimetableStore()
const router = useRouter()
const route = useRoute()
const refreshTimer = ref(null)
const isInFullscreen = ref(false)
const autoRefreshEnabled = ref(false)

// Load auto-refresh preference from localStorage
const loadAutoRefreshPreference = () => {
  try {
    const saved = localStorage.getItem(AUTO_REFRESH_KEY)
    return saved === 'true'
  } catch {
    return false
  }
}

// Save auto-refresh preference to localStorage
const saveAutoRefreshPreference = (enabled) => {
  try {
    localStorage.setItem(AUTO_REFRESH_KEY, String(enabled))
  } catch {
    // Silent fail - localStorage might not be available
  }
}

const apiKeyConfigured = Boolean(import.meta.env.VITE_GOLEMIO_API_KEY)
const isFullscreenRoute = computed(() => route.name === 'fullscreen')
const isOnStopPage = computed(() => Boolean(route.params.node))
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

const activeInfotexts = computed(() => {
  if (!store.infotexts || !store.infotexts.length) return []

  const now = new Date()

  // Filter infotexts that are currently valid and relevant to this stop
  return store.infotexts.filter(infotext => {
    // Check validity period
    const validFrom = infotext.valid_from ? new Date(infotext.valid_from) : null
    const validTo = infotext.valid_to ? new Date(infotext.valid_to) : null

    if (validFrom && now < validFrom) return false
    if (validTo && now > validTo) return false

    // Check if it's related to the current stop (if related_stops exists)
    if (infotext.related_stops && infotext.related_stops.length > 0 && store.selectedStop) {
      // Check if any of the selectedStop's gtfsIds match the related stops
      const isRelated = infotext.related_stops.some(relatedStopId => {
        return store.selectedStop.gtfsIds?.some(gtfsId => {
          return gtfsId === relatedStopId ||
                 gtfsId.replace(/P$/, '') === relatedStopId ||
                 relatedStopId.replace(/P$/, '') === gtfsId
        })
      })

      if (!isRelated) return false
    }

    return true
  })
})

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

  // Check if we're on a mobile device or if Fullscreen API is not supported
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  const supportsFullscreen = document.fullscreenEnabled || document.webkitFullscreenEnabled

  // On mobile or when Fullscreen API is not supported, navigate to fullscreen route
  if (isMobile || !supportsFullscreen) {
    router.push({ name: 'fullscreen', params: { node: store.selectedStop.node } })
    return
  }

  // Try native fullscreen API for desktop
  const element = document.querySelector('.board-panel')
  if (!element) {
    return
  }

  if (element.requestFullscreen) {
    element.requestFullscreen()
  } else if (element.webkitRequestFullscreen) {
    element.webkitRequestFullscreen()
  } else if (element.msRequestFullscreen) {
    element.msRequestFullscreen()
  }
}

const exitFullscreen = () => {
  if (document.exitFullscreen) {
    document.exitFullscreen()
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen()
  } else if (document.msExitFullscreen) {
    document.msExitFullscreen()
  }
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

const trackVehicle = (departure) => {
  // Use GTFS trip ID if available, fallback to regular ID
  const tripId = departure.gtfsTripId || departure.id

  if (!tripId || !store.selectedStop?.node) {
    return
  }

  // Store departure info for tracking
  store.setTrackingTarget({
    tripId: tripId,
    line: departure.line,
    destination: departure.destination,
    realtimeTime: departure.realtimeTime,
    plannedTime: departure.plannedTime,
  })

  // Navigate to vehicle tracking page with stop context
  router.push({
    name: 'track',
    params: {
      node: store.selectedStop.node,
      tripId: tripId
    }
  })
}

const toggleAutoRefresh = () => {
  autoRefreshEnabled.value = !autoRefreshEnabled.value
  saveAutoRefreshPreference(autoRefreshEnabled.value)

  if (autoRefreshEnabled.value) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}

const startAutoRefresh = () => {
  stopAutoRefresh()
  refreshTimer.value = window.setInterval(() => {
    if (store.hasSelection && !store.departuresLoading) {
      store.fetchDepartures()
    }
  }, REFRESH_INTERVAL)
}

const stopAutoRefresh = () => {
  if (refreshTimer.value) {
    clearInterval(refreshTimer.value)
    refreshTimer.value = null
  }
}

const handleFullscreenChange = () => {
  const isFullscreen = Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  )

  isInFullscreen.value = isFullscreen

  // In fullscreen mode, always auto-refresh
  // In normal mode, respect the user's toggle preference
  if (isFullscreen) {
    startAutoRefresh()
  } else if (autoRefreshEnabled.value) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}

onMounted(() => {
  // Load saved preference
  autoRefreshEnabled.value = loadAutoRefreshPreference()

  // Listen for fullscreen changes
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
  document.addEventListener('msfullscreenchange', handleFullscreenChange)

  // Check initial state and start auto-refresh if enabled
  handleFullscreenChange()
})

onBeforeUnmount(() => {
  stopAutoRefresh()
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
  document.removeEventListener('msfullscreenchange', handleFullscreenChange)
})
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
              : isOnStopPage
                ? 'Loading...'
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
        <label class="auto-refresh-toggle">
          <input
            type="checkbox"
            :checked="autoRefreshEnabled"
            @change="toggleAutoRefresh"
            :disabled="!store.hasSelection"
          />
          <span>Auto-refresh</span>
        </label>
        <button
          class="ghost"
          type="button"
          :disabled="!store.hasSelection || store.departuresLoading"
          @click="refreshBoard"
        >
          Refresh
        </button>
        <button
          v-if="!isFullscreenRoute && isInFullscreen"
          class="ghost"
          type="button"
          @click="exitFullscreen"
        >
          Exit fullscreen
        </button>
        <button
          v-else-if="!isFullscreenRoute"
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
      <div v-if="!store.hasSelection && !isOnStopPage" class="board-placeholder">
        <p>Select any stop to load live departures.</p>
        <p class="caption">
          Data sourced from PID open data + Golemio APIs.
        </p>
      </div>

      <div v-else-if="!store.hasSelection || isInitialLoad" class="board-placeholder">
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

      <div v-else>
        <!-- Display infotexts as alerts -->
        <div v-if="activeInfotexts.length > 0" class="infotexts-container">
          <div
            v-for="(infotext, index) in activeInfotexts"
            :key="index"
            class="infotext-alert"
            :class="{ 'infotext-inline': infotext.display_type === 'inline' }"
            role="alert"
          >
            <div class="infotext-icon">⚠</div>
            <div class="infotext-content">
              <p class="infotext-text">{{ infotext.text_en || infotext.text }}</p>
              <p v-if="infotext.text_en && infotext.text && infotext.text !== infotext.text_en" class="infotext-text-secondary">
                {{ infotext.text }}
              </p>
            </div>
          </div>
        </div>

        <table class="departure-grid" aria-live="polite">
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
          <tr
            v-for="departure in formattedDepartures"
            :key="departure.id"
            class="departure-row"
            @click="trackVehicle(departure)"
            role="button"
            tabindex="0"
            :title="`Track ${departure.line} to ${departure.destination}`"
          >
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

