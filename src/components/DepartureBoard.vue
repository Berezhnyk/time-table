<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTimetableStore } from '../stores/timetableStore'
import { getTransportMeta, getTransportIconSvg } from '../utils/transport'

const REFRESH_INTERVAL = 5000
const AUTO_REFRESH_KEY = 'timetable_auto_refresh'

const store = useTimetableStore()
const router = useRouter()
const route = useRoute()
const refreshTimer = ref(null)
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
    const transportMeta = getTransportMeta(
      departure.transportKey || departure.vehicleType,
      departure.line // Pass line name for metro color
    )

    return {
      ...departure,
      transportMeta,
      transportIcon: getTransportIconSvg(transportMeta.label, 20),
      plannedLabel: formatTime(departure.plannedTime),
      realtimeLabel: formatTime(departure.realtimeTime),
      status: formatStatus(departure),
      etaLabel: formatEta(departure.minutesUntil),
    }
  })
)

const departuresByPlatform = computed(() => {
  const grouped = {}

  // Helper function to generate smart platform names for metro
  const generatePlatformName = (departure, allDepartures) => {
    // If platform is provided and not a dash/hyphen, use it
    if (departure.platform && departure.platform !== '-' && departure.platform !== '—') {
      return departure.platform
    }

    // For metro stations, generate intelligent names
    if (departure.transportMeta.label === 'Metro') {
      // Get all metro lines at this stop
      const metroLines = new Set(
        allDepartures
          .filter(d => d.transportMeta.label === 'Metro')
          .map(d => d.line)
      )

      // If multiple metro lines (intersection), show intersection
      if (metroLines.size > 1) {
        const sortedLines = Array.from(metroLines).sort()
        return `Metro ${sortedLines.join(' & ')}`
      }

      // Single metro line - show line and direction
      return `Metro ${departure.line} → ${departure.destination}`
    }

    return departure.platform || 'Unknown'
  }

  // Group departures by smart platform name
  formattedDepartures.value.forEach(departure => {
    const platform = generatePlatformName(departure, formattedDepartures.value)
    if (!grouped[platform]) {
      grouped[platform] = []
    }
    grouped[platform].push(departure)
  })

  // Sort platforms: Metro first, then numbers, then letters, then "Unknown"
  const sortedPlatforms = Object.keys(grouped).sort((a, b) => {
    if (a === 'Unknown') return 1
    if (b === 'Unknown') return -1

    const aIsMetro = a.startsWith('Metro ')
    const bIsMetro = b.startsWith('Metro ')

    // Metro platforms come first
    if (aIsMetro && !bIsMetro) return -1
    if (!aIsMetro && bIsMetro) return 1

    // Both metro - sort alphabetically by line
    if (aIsMetro && bIsMetro) {
      return a.localeCompare(b, undefined, { numeric: true })
    }

    const aIsNumber = /^\d+$/.test(a)
    const bIsNumber = /^\d+$/.test(b)

    if (aIsNumber && !bIsNumber) return -1
    if (!aIsNumber && bIsNumber) return 1

    return a.localeCompare(b, undefined, { numeric: true })
  })

  return sortedPlatforms.map(platform => {
    const platformDepartures = grouped[platform]

    // Limit to 3 departures per line+destination combination
    const lineDestinationCount = {}
    const filteredDepartures = []

    platformDepartures.forEach(departure => {
      const key = `${departure.line}-${departure.destination}`
      const count = lineDestinationCount[key] || 0

      if (count < 3) {
        filteredDepartures.push(departure)
        lineDestinationCount[key] = count + 1
      }
    })

    return {
      platform,
      departures: filteredDepartures,
      totalCount: platformDepartures.length,
      filteredCount: filteredDepartures.length
    }
  })
})

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

  // Navigate to fullscreen route instead of using native Fullscreen API
  // This provides a consistent, scrollable experience across all platforms
  router.push({ name: 'fullscreen', params: { node: store.selectedStop.node } })

  // On mobile, scroll to top after entering fullscreen
  if (window.innerWidth <= 768) {
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 100)
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

onMounted(() => {
  // Load saved preference and start auto-refresh if enabled
  autoRefreshEnabled.value = loadAutoRefreshPreference()

  if (autoRefreshEnabled.value) {
    startAutoRefresh()
  }
})

onBeforeUnmount(() => {
  stopAutoRefresh()
})

// Watch for route changes to scroll to board when exiting fullscreen on mobile
watch(
  () => route.name,
  (newRouteName, oldRouteName) => {
    // When exiting fullscreen on mobile, scroll to departure board
    if (oldRouteName === 'fullscreen' && newRouteName === 'stop' && window.innerWidth <= 768) {
      setTimeout(() => {
        const boardPanel = document.querySelector('.board-panel')
        if (boardPanel) {
          boardPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    }
  }
)
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

        <div v-if="!formattedDepartures.length" class="board-placeholder">
          No departures are scheduled in the next hour.
        </div>

        <div v-else class="platforms-container">
          <div
            v-for="platformGroup in departuresByPlatform"
            :key="platformGroup.platform"
            class="platform-group"
          >
            <div class="platform-group-header">
              <h3 class="platform-title">
                Platform <span class="platform-badge-large">{{ platformGroup.platform }}</span>
              </h3>
              <span class="platform-count">
                <template v-if="platformGroup.totalCount > platformGroup.filteredCount">
                  {{ platformGroup.filteredCount }} of {{ platformGroup.totalCount }} departures
                </template>
                <template v-else>
                  {{ platformGroup.departures.length }} departure{{ platformGroup.departures.length !== 1 ? 's' : '' }}
                </template>
              </span>
            </div>

            <table class="departure-grid" aria-live="polite">
              <thead>
                <tr>
                  <th scope="col">Mode</th>
                  <th scope="col">Line</th>
                  <th scope="col">Destination</th>
                  <th scope="col">Arrives</th>
                  <th scope="col">Planned</th>
                  <th scope="col">Live</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="departure in platformGroup.departures"
                  :key="departure.id"
                  class="departure-row"
                  @click="trackVehicle(departure)"
                  role="button"
                  tabindex="0"
                  :title="`Track ${departure.line} to ${departure.destination}`"
                >
                  <td>
                    <span
                      class="transport-icon"
                      :style="{ '--icon-bg-color': departure.transportMeta.color }"
                      :aria-label="departure.transportMeta.label"
                      v-html="departure.transportIcon"
                    >
                    </span>
                  </td>
                  <td class="line-cell">
                    <span class="line-code">{{ departure.line }}</span>
                  </td>
                  <td>{{ departure.destination }}</td>
                  <td class="eta-cell">
                    {{ departure.etaLabel }}
                  </td>
                  <td>{{ departure.plannedLabel }}</td>
                  <td>{{ departure.realtimeLabel }}</td>
                  <td :class="{ delayed: departure.status.includes('+') }">
                    {{ departure.status }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
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

