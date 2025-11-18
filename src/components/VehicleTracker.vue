<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTimetableStore } from '../stores/timetableStore'
import { getTransportMeta } from '../utils/transport'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const store = useTimetableStore()
const route = useRoute()
const router = useRouter()

const map = ref(null)
const mapContainer = ref(null)
const vehicleMarker = ref(null)
const stopMarker = ref(null)
const routeLine = ref(null)
const updateTimer = ref(null)
const trackingError = ref(null)
const lastUpdate = ref(null)

const tripId = computed(() => route.params.tripId)
const stopNode = computed(() => route.params.node)
const vehicleData = computed(() => store.trackedVehicle)
const isLoading = computed(() => store.vehicleLoading)

const transportMeta = computed(() => {
  if (!vehicleData.value) return null
  return getTransportMeta(vehicleData.value.transportKey || vehicleData.value.vehicleType)
})

const statusLabel = computed(() => {
  if (!vehicleData.value) return 'Waiting for data...'

  const delay = vehicleData.value.delay
  if (delay > 0) return `+${delay} min delay`
  if (delay < 0) return `${delay} min early`
  return 'On time'
})

const distanceToStop = computed(() => {
  if (!vehicleData.value || !store.selectedStop) return null

  const stopLatLng = L.latLng(store.selectedStop.lat, store.selectedStop.lon)
  const vehicleLatLng = L.latLng(vehicleData.value.lat, vehicleData.value.lon)
  const distanceM = stopLatLng.distanceTo(vehicleLatLng)

  if (distanceM < 1000) {
    return `${Math.round(distanceM)} m`
  }
  return `${(distanceM / 1000).toFixed(2)} km`
})

const lastUpdateLabel = computed(() => {
  if (!lastUpdate.value) return '—'
  return new Date(lastUpdate.value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
})

// Custom vehicle icon
const createVehicleIcon = (color) => {
  return L.divIcon({
    className: 'vehicle-marker',
    html: `
      <div class="vehicle-marker-inner" style="background-color: ${color}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
          <path d="M8 2L3 6v6l5 2 5-2V6L8 2z"/>
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

// Custom stop icon
const createStopIcon = () => {
  return L.divIcon({
    className: 'stop-marker',
    html: `
      <div class="stop-marker-inner">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="white">
          <circle cx="6" cy="6" r="4"/>
        </svg>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

const initMap = () => {
  if (map.value) return

  // Initialize map centered on Prague
  map.value = L.map(mapContainer.value, {
    zoomControl: true,
  }).setView([50.0755, 14.4378], 13)

  // Add tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(map.value)
}

const updateVehiclePosition = () => {
  if (!vehicleData.value || !map.value) return

  const { lat, lon } = vehicleData.value
  if (!lat || !lon) return

  const position = [lat, lon]
  const color = transportMeta.value?.color || '#666'

  // Update or create vehicle marker
  if (vehicleMarker.value) {
    vehicleMarker.value.setLatLng(position)
    vehicleMarker.value.setIcon(createVehicleIcon(color))
  } else {
    vehicleMarker.value = L.marker(position, {
      icon: createVehicleIcon(color),
      zIndexOffset: 1000,
    }).addTo(map.value)

    vehicleMarker.value.bindPopup(`
      <strong>${vehicleData.value.line || 'Vehicle'}</strong><br>
      ${vehicleData.value.destination || 'Unknown destination'}<br>
      <small>Real-time position</small>
    `)
  }

  // Add stop marker if we have stop coordinates
  if (store.selectedStop) {
    const stopPos = [store.selectedStop.lat, store.selectedStop.lon]

    if (!stopMarker.value) {
      stopMarker.value = L.marker(stopPos, {
        icon: createStopIcon(),
        zIndexOffset: 900,
      }).addTo(map.value)

      stopMarker.value.bindPopup(`
        <strong>${store.selectedStop.displayName}</strong><br>
        Origin stop<br>
        <small>Node ${store.selectedStop.node}</small>
      `)
    }

    // Calculate distance between stop and vehicle
    const stopLatLng = L.latLng(stopPos)
    const vehicleLatLng = L.latLng(position)
    const distanceMeters = stopLatLng.distanceTo(vehicleLatLng)
    const distance = (distanceMeters / 1000).toFixed(2) // km

    // Prepare route coordinates
    let routeCoords = [stopPos, position] // Default: straight line
    let isActualRoute = false

    // Try to use actual route geometry if available
    if (vehicleData.value.routeShape) {
      // GTFS shape format: array of {lat, lon} or {shape_pt_lat, shape_pt_lon}
      const shapePoints = vehicleData.value.routeShape
      if (Array.isArray(shapePoints) && shapePoints.length > 0) {
        routeCoords = shapePoints.map(pt => [
          pt.lat || pt.shape_pt_lat,
          pt.lon || pt.shape_pt_lon
        ]).filter(coord => coord[0] && coord[1])
        if (routeCoords.length > 1) {
          isActualRoute = true
        }
      }
    } else if (vehicleData.value.geometry?.type === 'LineString') {
      // GeoJSON LineString format: coordinates are [lon, lat]
      const coords = vehicleData.value.geometry.coordinates
      if (Array.isArray(coords) && coords.length > 0) {
        routeCoords = coords.map(coord => [coord[1], coord[0]]) // Swap to [lat, lon]
        if (routeCoords.length > 1) {
          isActualRoute = true
        }
      }
    }

    // Create or update route line
    if (routeLine.value) {
      routeLine.value.setLatLngs(routeCoords)
      routeLine.value.setStyle({
        color: color,
        weight: isActualRoute ? 4 : 5,
        opacity: isActualRoute ? 0.9 : 0.8,
        dashArray: isActualRoute ? null : '12, 8',
      })
    } else {
      routeLine.value = L.polyline(routeCoords, {
        color: color,
        weight: isActualRoute ? 4 : 5,
        opacity: isActualRoute ? 0.9 : 0.8,
        dashArray: isActualRoute ? null : '12, 8',
        lineCap: 'round',
        lineJoin: 'round',
        interactive: true,
      }).addTo(map.value)

      routeLine.value.bindPopup(`
        <strong>Distance:</strong> ${distance} km<br>
        <small>${isActualRoute ? 'Actual route path' : 'Direct line from stop to vehicle'}</small>
      `)
    }

    // Update popup with current distance
    routeLine.value.setPopupContent(`
      <strong>Distance:</strong> ${distance} km<br>
      <small>${isActualRoute ? 'Actual route path' : 'Direct line from stop to vehicle'}</small>
    `)

    // Fit bounds to show both stop and vehicle (and route if available)
    let boundsPoints = [stopPos, position]

    // If we have actual route data, include all route points for better framing
    if (isActualRoute && routeCoords.length > 2) {
      boundsPoints = routeCoords
    }

    const bounds = L.latLngBounds(boundsPoints)

    // Adjust padding based on screen size
    const isMobile = window.innerWidth <= 768

    // If very close (< 200m), limit zoom to avoid overlap
    const maxZoomLevel = distanceMeters < 200 ? 15 : (isMobile ? 16 : 17)

    const paddingOptions = isMobile
      ? {
          // Mobile: map is 50vh, so use smaller balanced padding to center points in map area
          paddingTopLeft: [20, 40],
          paddingBottomRight: [20, 40],
          maxZoom: maxZoomLevel,
        }
      : {
          paddingTopLeft: [80, 80],      // Desktop: left and top padding
          paddingBottomRight: [380, 80], // Desktop: account for sidebar on right
          maxZoom: maxZoomLevel,
        }

    map.value.fitBounds(bounds, paddingOptions)
  } else {
    // No stop selected, just center on vehicle
    map.value.setView(position, 15)
  }

  lastUpdate.value = new Date()
}

const startTracking = async () => {
  if (!tripId.value) {
    trackingError.value = 'No trip ID provided'
    return
  }

  try {
    await store.fetchVehiclePosition(tripId.value)
    updateVehiclePosition()

    // Set up auto-refresh every 5 seconds
    updateTimer.value = setInterval(async () => {
      try {
        await store.fetchVehiclePosition(tripId.value)
        updateVehiclePosition()
        trackingError.value = null
      } catch (error) {
        trackingError.value = 'Failed to update vehicle position'
      }
    }, 5000)
  } catch (error) {
    trackingError.value = error.message || 'Failed to start tracking'
  }
}

const stopTracking = () => {
  if (updateTimer.value) {
    clearInterval(updateTimer.value)
    updateTimer.value = null
  }
  store.clearVehicleTracking()
}

const goBack = () => {
  stopTracking()

  // Navigate back to stop page using node from route
  if (stopNode.value) {
    router.push({ name: 'stop', params: { node: stopNode.value } }).then(() => {
      // Scroll to departure board after navigation
      setTimeout(() => {
        const boardPanel = document.querySelector('.board-panel')
        if (boardPanel) {
          boardPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    })
  } else {
    router.push({ name: 'home' })
  }
}

watch(vehicleData, () => {
  if (vehicleData.value) {
    updateVehiclePosition()

    // Recalculate bounds after DOM updates and sidebar content is rendered
    // This ensures the map bounds are correct after the sidebar height changes
    setTimeout(() => {
      if (map.value) {
        map.value.invalidateSize()
        updateVehiclePosition()
      }
    }, 100)
  }
})

onMounted(async () => {
  initMap()

  // Ensure stops are loaded
  if (!store.stopCount) {
    await store.fetchStops()
  }

  // Ensure the stop from the route is selected
  if (stopNode.value && (!store.selectedStop || store.selectedStop.node !== stopNode.value)) {
    const stop = store.stops.find(s => String(s.node) === String(stopNode.value))
    if (stop) {
      // Select stop without fetching departures (we just need the stop data)
      store.selectedStop = stop
    }
  }

  startTracking()
})

onUnmounted(() => {
  stopTracking()
  if (map.value) {
    map.value.remove()
    map.value = null
  }
})
</script>

<template>
  <div class="tracker-container">
    <header class="tracker-header" @click="goBack" role="button" tabindex="0" title="Return to home">
      <button class="ghost back-button" @click.stop="goBack">
        ← Back
      </button>

      <div v-if="vehicleData" class="vehicle-info">
        <span
          v-if="transportMeta"
          class="transport-chip"
          :style="{ '--chip-color': transportMeta.color }"
          :aria-label="transportMeta.label"
        >
          {{ transportMeta.code }}
        </span>
        <span class="line-code">{{ vehicleData.line }}</span>
        <span class="destination">→ {{ vehicleData.destination }}</span>
      </div>

      <div v-else class="vehicle-info">
        <span class="loading-text">Loading vehicle data...</span>
      </div>
    </header>

    <div class="tracker-content">
      <div ref="mapContainer" class="tracker-map"></div>

      <aside class="tracker-sidebar">
        <div v-if="trackingError" class="tracker-error" role="alert">
          <p>{{ trackingError }}</p>
        </div>

        <div v-else-if="vehicleData" class="tracker-details">
          <div class="detail-section">
            <h3>Current Status</h3>
            <p class="status-label" :class="{ delayed: vehicleData.delay > 0 }">
              {{ statusLabel }}
            </p>
          </div>

          <div class="detail-section">
            <h3>Position</h3>
            <p class="coords">
              {{ vehicleData.lat?.toFixed(6) }}, {{ vehicleData.lon?.toFixed(6) }}
            </p>
          </div>

          <div v-if="distanceToStop" class="detail-section">
            <h3>Distance from Stop</h3>
            <p class="distance-value">{{ distanceToStop }}</p>
            <p class="caption" style="margin-top: 0.5rem;">
              Direct distance "as the crow flies". The map shows the actual route path when available.
            </p>
          </div>

          <div v-if="vehicleData.speed" class="detail-section">
            <h3>Speed</h3>
            <p>{{ Math.round(vehicleData.speed) }} km/h</p>
          </div>

          <div class="detail-section">
            <h3>Last Update</h3>
            <p>{{ lastUpdateLabel }}</p>
          </div>

          <div v-if="store.selectedStop" class="detail-section">
            <h3>Origin Stop</h3>
            <p>{{ store.selectedStop.displayName }}</p>
            <p class="caption">Node {{ store.selectedStop.node }}</p>
          </div>
        </div>

        <div v-else-if="isLoading" class="tracker-placeholder">
          <p>Locating vehicle...</p>
        </div>

        <div class="tracker-info">
          <p class="caption">
            Real-time vehicle tracking powered by Golemio API.
            Position updates every 5 seconds.
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.tracker-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--surface-dark);
}

.tracker-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: var(--surface-base);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.tracker-header:hover {
  background: rgba(157, 230, 122, 0.08);
}

.back-button {
  font-size: 0.9rem;
}

.vehicle-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
}

.loading-text {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.line-code {
  font-weight: 600;
  font-size: 1.1rem;
}

.destination {
  color: var(--text-secondary);
}

.tracker-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.tracker-map {
  flex: 1;
  position: relative;
}

.tracker-sidebar {
  width: 320px;
  background: var(--surface-base);
  border-left: 1px solid var(--border-subtle);
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.tracker-error {
  padding: 1rem;
  background: var(--error-surface, #ff000015);
  border: 1px solid var(--error-border, #ff000033);
  border-radius: 0.5rem;
  color: var(--error-text, #ff4444);
}

.tracker-details {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.detail-section h3 {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.detail-section p {
  font-size: 0.95rem;
  color: var(--text-primary);
}

.status-label {
  font-weight: 600;
  padding: 0.5rem 0.75rem;
  background: var(--success-surface, #00ff0015);
  border: 1px solid var(--success-border, #00ff0033);
  border-radius: 0.375rem;
  display: inline-block;
}

.status-label.delayed {
  background: var(--warning-surface, #ff880015);
  border-color: var(--warning-border, #ff880033);
}

.coords {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.distance-value {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-primary);
}

.tracker-placeholder {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--text-secondary);
}

.tracker-info {
  margin-top: auto;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border-subtle);
}

.caption {
  font-size: 0.8rem;
  color: var(--text-tertiary);
  line-height: 1.4;
}

/* Vehicle marker styles */
:deep(.vehicle-marker) {
  background: none;
  border: none;
}

:deep(.vehicle-marker-inner) {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  border: 2px solid white;
}

:deep(.stop-marker) {
  background: none;
  border: none;
}

:deep(.stop-marker-inner) {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--text-secondary);
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

/* Leaflet polyline styling */
:deep(.leaflet-interactive) {
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
}

/* Mobile responsive */
@media (max-width: 768px) {
  .tracker-content {
    flex-direction: column;
  }

  .tracker-map {
    height: 50vh;
  }

  .tracker-sidebar {
    width: 100%;
    border-left: none;
    border-top: 1px solid var(--border-subtle);
    max-height: 50vh;
  }
}
</style>
