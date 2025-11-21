<script setup>
import { ref, onMounted, onUnmounted, computed, watch, markRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTimetableStore } from '../stores/timetableStore'
import { useThemeStore } from '../stores/themeStore'
import { getTransportMeta } from '../utils/transport'
import axios from 'axios'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const { t } = useI18n()

const store = useTimetableStore()
const themeStore = useThemeStore()
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
const nextStopName = ref(null)
const currentStopName = ref(null)
const selectedStopArrivalTime = ref(null)
const locatingUser = ref(false)
const userLocation = ref(null)
const showResetView = ref(false)
const routeStops = ref([])
let currentTileLayer = null
let userMarker = null
let watchId = null
let userInteractedWithMap = false
let initialBoundsSet = false
let routeStopMarkers = []

const tripId = computed(() => route.params.tripId)
const stopNode = computed(() => route.params.node)
const vehicleData = computed(() => store.trackedVehicle)
const isLoading = computed(() => store.vehicleLoading)

const transportMeta = computed(() => {
  if (!vehicleData.value) return null
  // For metro, pass line name to get correct color
  const lineName = vehicleData.value.transportKey === 'metro' ? vehicleData.value.line : null
  return getTransportMeta(vehicleData.value.transportKey || vehicleData.value.vehicleType, lineName)
})

const transportTypeLabel = computed(() => {
  if (!vehicleData.value) return ''
  const type = vehicleData.value.vehicleType || transportMeta.value?.type || ''

  switch (type) {
    case 'metro':
      return t('vehicleTracker.vehicleTypes.metro')
    case 'tram':
      return t('vehicleTracker.vehicleTypes.tram')
    case 'bus':
      return t('vehicleTracker.vehicleTypes.bus')
    case 'trolleybus':
      return t('vehicleTracker.vehicleTypes.trolleybus')
    case 'train':
      return t('vehicleTracker.vehicleTypes.train')
    case 'ferry':
      return t('vehicleTracker.vehicleTypes.ferry')
    default:
      return type ? type.charAt(0).toUpperCase() + type.slice(1) : ''
  }
})

const statusLabel = computed(() => {
  if (!vehicleData.value) return t('vehicleTracker.waitingForData')

  const delay = vehicleData.value.delay
  if (delay > 0) return t('vehicleTracker.delayed', { minutes: delay })
  if (delay < 0) return t('vehicleTracker.early', { minutes: Math.abs(delay) })
  return t('vehicleTracker.onTime')
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

const distanceFromUser = computed(() => {
  if (!vehicleData.value || !userLocation.value) return null

  const userLatLng = L.latLng(userLocation.value.lat, userLocation.value.lon)
  const vehicleLatLng = L.latLng(vehicleData.value.lat, vehicleData.value.lon)
  const distanceM = userLatLng.distanceTo(vehicleLatLng)

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

const nextStopTime = computed(() => {
  if (!vehicleData.value?.nextStop?.arrival_time) return null
  const arrivalDate = new Date(vehicleData.value.nextStop.arrival_time)
  return arrivalDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
})

const minutesToNextStop = computed(() => {
  if (!vehicleData.value?.nextStop?.arrival_time) return null
  const arrivalDate = new Date(vehicleData.value.nextStop.arrival_time)
  const now = new Date()
  const diff = Math.round((arrivalDate - now) / 60000)
  return Math.max(0, diff)
})

const currentStopTime = computed(() => {
  if (!vehicleData.value?.lastStop?.arrival_time) return null
  const arrivalDate = new Date(vehicleData.value.lastStop.arrival_time)
  return arrivalDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
})

const minutesToCurrentStop = computed(() => {
  if (!vehicleData.value?.lastStop?.arrival_time) return null
  const arrivalDate = new Date(vehicleData.value.lastStop.arrival_time)
  const now = new Date()
  const diff = Math.round((arrivalDate - now) / 60000)
  return diff
})

const selectedStopTime = computed(() => {
  if (!selectedStopArrivalTime.value) return null
  const arrivalDate = new Date(selectedStopArrivalTime.value)
  return arrivalDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
})

const minutesToSelectedStop = computed(() => {
  if (!selectedStopArrivalTime.value) return null
  const arrivalDate = new Date(selectedStopArrivalTime.value)
  const now = new Date()
  const diff = Math.round((arrivalDate - now) / 60000)
  return diff
})

const bearingLabel = computed(() => {
  if (!vehicleData.value?.bearing) return null
  const bearing = vehicleData.value.bearing
  if (bearing >= 337.5 || bearing < 22.5) return t('vehicleTracker.directions.n')
  if (bearing >= 22.5 && bearing < 67.5) return t('vehicleTracker.directions.ne')
  if (bearing >= 67.5 && bearing < 112.5) return t('vehicleTracker.directions.e')
  if (bearing >= 112.5 && bearing < 157.5) return t('vehicleTracker.directions.se')
  if (bearing >= 157.5 && bearing < 202.5) return t('vehicleTracker.directions.s')
  if (bearing >= 202.5 && bearing < 247.5) return t('vehicleTracker.directions.sw')
  if (bearing >= 247.5 && bearing < 292.5) return t('vehicleTracker.directions.w')
  if (bearing >= 292.5 && bearing < 337.5) return t('vehicleTracker.directions.nw')
  return null
})

const statusBadgeClass = computed(() => {
  if (!vehicleData.value) return ''
  if (vehicleData.value.isCanceled) return 'status-canceled'
  if (vehicleData.value.delay > 5) return 'status-delayed'
  if (vehicleData.value.delay < -1) return 'status-early'
  return 'status-ontime'
})

const statusPositionLabel = computed(() => {
  if (!vehicleData.value?.statePosition) return null
  const state = vehicleData.value.statePosition
  // Convert snake_case to readable format
  return state.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
})

const fetchStopName = async (stopId, targetRef) => {
  if (!stopId) {
    targetRef.value = null
    return
  }

  // Try to find stop in the loaded stops by matching the GTFS ID
  const stop = store.stops.find(s => {
    // Check if any of the gtfsIds array contains this ID
    return s.gtfsIds?.some(id => {
      // GTFS IDs are in format like "U7288Z1", "U876Z1P", etc.
      // Check exact match or without trailing 'P'
      return id === stopId || id.replace(/P$/, '') === stopId || id === stopId.replace(/P$/, '')
    })
  })

  if (stop) {
    targetRef.value = stop.displayName
  } else {
    // If we can't find it in the store, try to fetch from Golemio API
    try {
      const { data } = await axios.get(`/api/golemio/gtfs/stops/${encodeURIComponent(stopId)}`)
      targetRef.value = data.stop_name || data.name || 'Unknown Stop'
    } catch (error) {
      targetRef.value = 'Stop'
    }
  }
}

const fetchNextStopName = async (stopId) => {
  await fetchStopName(stopId, nextStopName)
}

const fetchCurrentStopName = async (stopId) => {
  await fetchStopName(stopId, currentStopName)
}

const fetchAllRouteStops = async () => {
  if (!tripId.value) return []

  try {
    const headers = {
      Accept: 'application/json',
    }

    // Only send API key in dev mode
    if (import.meta.env.DEV && import.meta.env.VITE_GOLEMIO_API_KEY) {
      headers['X-Access-Token'] = import.meta.env.VITE_GOLEMIO_API_KEY
    }

    // Try multiple API endpoint variations based on official API docs
    const endpointVariations = [
      // Variation 1: Public API (optimized for client apps)
      {
        name: 'Public API',
        endpoint: import.meta.env.DEV
          ? `/golemio/v2/public/gtfs/trips/${encodeURIComponent(tripId.value)}`
          : '/api/golemio',
        params: import.meta.env.DEV
          ? { scopes: 'stop_times' }
          : { path: `public/gtfs/trips/${encodeURIComponent(tripId.value)}`, scopes: 'stop_times' }
      },
      // Variation 2: GTFS Trips with enrichments (includeStops and includeStopTimes)
      {
        name: 'GTFS Enriched',
        endpoint: import.meta.env.DEV
          ? `/golemio/v2/gtfs/trips/${encodeURIComponent(tripId.value)}`
          : '/api/golemio',
        params: import.meta.env.DEV
          ? { includeStops: true, includeStopTimes: true }
          : { path: `gtfs/trips/${encodeURIComponent(tripId.value)}`, includeStops: true, includeStopTimes: true }
      }
    ]

    for (const variation of endpointVariations) {
      try {
        const { data } = await axios.get(variation.endpoint, {
          headers,
          params: variation.params,
          timeout: 15000,
        })

        // Extract stop times from response
        const stopTimes = data.stop_times || data.stopTimes || data.stoptimes || []

        if (stopTimes.length > 0) {
          // Store in component state
          routeStops.value = stopTimes
          return stopTimes
        }
      } catch (err) {
        // Continue to next variation
        continue
      }
    }

    return []
  } catch (error) {
    console.error('Failed to fetch route stops:', error)
    return []
  }
}

// Display all route stops on the map
const displayRouteStops = () => {
  if (!map.value || !routeStops.value || routeStops.value.length === 0) return

  // Skip if map is animating to avoid _latLngToNewLayerPoint errors
  if (map.value._animatingZoom || map.value._zooming) return

  // Clear existing route stop markers
  routeStopMarkers.forEach(marker => {
    if (map.value) {
      try {
        map.value.removeLayer(marker)
      } catch (e) {
        // Ignore errors during removal (map might be mid-animation)
      }
    }
  })
  routeStopMarkers = []

  // Remove the single origin stop marker since it will be replaced by route stops
  if (stopMarker.value && map.value) {
    try {
      map.value.removeLayer(stopMarker.value)
      stopMarker.value = null
    } catch (e) {
      // Ignore errors during removal
    }
  }

  // Get current stop sequence for color coding
  const nextStopSequence = vehicleData.value?.nextStop?.sequence
  const lastStopSequence = vehicleData.value?.lastStop?.sequence

  routeStops.value.forEach((stopTime) => {
    // Extract coordinates from GeoJSON
    const coordinates = stopTime.stop?.geometry?.coordinates
    if (!coordinates || coordinates.length < 2) return

    const [lon, lat] = coordinates
    const stopName = stopTime.stop?.properties?.stop_name || stopTime.stop_name || 'Unknown Stop'
    const sequence = stopTime.stop_sequence

    // Determine stop status for color coding
    let status = 'future'

    if (lastStopSequence && sequence < lastStopSequence) {
      status = 'past'
    } else if (lastStopSequence && sequence === lastStopSequence) {
      status = 'current'
    } else if (nextStopSequence && sequence === nextStopSequence) {
      status = 'next'
    }

    // Check if this is the user's selected origin stop
    if (store.selectedStop?.gtfsIds) {
      const isSelectedStop = store.selectedStop.gtfsIds.some(gtfsId => {
        const stopId = stopTime.stop_id || stopTime.stop?.properties?.stop_id
        return stopId === gtfsId ||
               stopId?.replace(/P$/, '') === gtfsId ||
               gtfsId?.replace(/P$/, '') === stopId
      })
      if (isSelectedStop) {
        status = 'selected'
      }
    }

    // Create marker with appropriate icon
    try {
      const marker = L.marker([lat, lon], {
        icon: createRouteStopIcon(status),
        zIndexOffset: status === 'current' || status === 'next' ? 800 : 700,
      }).addTo(map.value)

      // Format arrival time
      const arrivalTime = stopTime.arrival_time || 'N/A'
      const platformCode = stopTime.stop?.properties?.platform_code

      // Create popup content
      let popupContent = `
        <div style="min-width: 150px;">
          <strong>${stopName}</strong><br>
          <small>Stop ${sequence}</small><br>
          Arrival: ${arrivalTime}
      `

      if (platformCode) {
        popupContent += `<br>Platform: ${platformCode}`
      }

      popupContent += '</div>'

      marker.bindPopup(popupContent)

      // Store marker reference
      routeStopMarkers.push(marker)
    } catch (e) {
      // Skip this marker if there's an error (e.g., during zoom animation)
    }
  })
}

// Update route stops color coding based on vehicle progress
const updateRouteStopsDisplay = () => {
  // Simply re-render all stops with updated status
  displayRouteStops()
}

const fetchSelectedStopArrival = async () => {
  if (!tripId.value || !store.selectedStop) {
    selectedStopArrivalTime.value = null
    return
  }

  // First, try to use the tracking target departure time if available
  if (store.trackingTarget?.realtimeTime || store.trackingTarget?.plannedTime) {
    selectedStopArrivalTime.value = store.trackingTarget.realtimeTime || store.trackingTarget.plannedTime
    return
  }

  // If we don't have a tracking target, try to find the departure in the loaded departures
  let departure = store.departures.find(d => d.id === tripId.value || d.gtfsTripId === tripId.value)

  // If departures aren't loaded yet (page refresh), fetch them first
  if (!departure && store.selectedStop && (!store.departures || store.departures.length === 0)) {
    try {
      await store.fetchDepartures()
      departure = store.departures.find(d => d.id === tripId.value || d.gtfsTripId === tripId.value)
    } catch (error) {
      // Continue to try other methods
    }
  }

  // If we found the departure in the current departures, use it
  if (departure) {
    selectedStopArrivalTime.value = departure.realtimeTime || departure.plannedTime
    return
  }

  // Use the route stops data we already fetched (no need for another API call)
  if (routeStops.value && routeStops.value.length > 0 && store.selectedStop?.gtfsIds) {
    const stopTime = routeStops.value.find(st => {
      const stopId = st.stop_id || st.stop?.properties?.stop_id
      return store.selectedStop.gtfsIds.some(gtfsId => {
        return stopId === gtfsId || stopId?.replace(/P$/, '') === gtfsId || gtfsId?.replace(/P$/, '') === stopId
      })
    })

    if (stopTime) {
      // Get arrival time - prefer actual/predicted over scheduled
      let timeString =
        stopTime.arrival_time?.predicted ||
        stopTime.arrival_time?.actual ||
        stopTime.arrival_time?.scheduled ||
        stopTime.arrival_time ||
        null

      // If we got a time string like "19:04:40", convert it to a full date-time
      if (timeString && typeof timeString === 'string' && timeString.includes(':')) {
        // Create a date for today with this time
        const now = new Date()
        const [hours, minutes, seconds] = timeString.split(':').map(Number)
        const arrivalDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, seconds || 0)

        // If the time is more than 12 hours in the past, it's probably tomorrow
        if (arrivalDate < now && (now - arrivalDate) > 12 * 60 * 60 * 1000) {
          arrivalDate.setDate(arrivalDate.getDate() + 1)
        }

        selectedStopArrivalTime.value = arrivalDate.toISOString()
      } else {
        selectedStopArrivalTime.value = timeString
      }
    } else {
      selectedStopArrivalTime.value = null
    }
  } else {
    // If all methods fail, we just won't show the selected stop section
    selectedStopArrivalTime.value = null
  }
}

// Custom vehicle icon with transport type
const createVehicleIcon = (color, transportType) => {
  // Normalize transport type (handle cases like "night bus", "regional bus", etc.)
  const normalizedType = transportType?.toLowerCase().trim()
  let vehicleCategory = 'generic'

  // Determine vehicle category from transport type
  if (normalizedType?.includes('metro') || normalizedType?.includes('subway')) {
    vehicleCategory = 'metro'
  } else if (normalizedType?.includes('tram') || normalizedType?.includes('streetcar')) {
    vehicleCategory = 'tram'
  } else if (normalizedType?.includes('bus')) {
    vehicleCategory = 'bus'
  } else if (normalizedType?.includes('trolley')) {
    vehicleCategory = 'trolleybus'
  } else if (normalizedType?.includes('train') || normalizedType?.includes('rail')) {
    vehicleCategory = 'train'
  } else if (normalizedType?.includes('ferry') || normalizedType?.includes('boat')) {
    vehicleCategory = 'ferry'
  }

  // Create different icons based on transport type
  let iconSvg = ''

  switch (vehicleCategory) {
    case 'metro':
      // Metro train icon
      iconSvg = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C8 2 4 2.5 4 6v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zm0 2c3.51 0 5.63.97 5.92 2H6.08C6.37 4.97 8.49 4 12 4zM6 7h5v3H6V7zm7 0h5v3h-5V7zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
        </svg>
      `
      break
    case 'tram':
      // Tram icon
      iconSvg = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20v1h2.23l2-2H14l2 2H18v-1l-1.5-1c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm6 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1-7h-5V6h5v4z"/>
        </svg>
      `
      break
    case 'bus':
      // Bus icon
      iconSvg = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zm5.5 3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5S16 7.83 16 7s.67-1.5 1.5-1.5zm-11 0C7.33 5.5 8 6.17 8 7s-.67 1.5-1.5 1.5S5 7.83 5 7s.67-1.5 1.5-1.5zM6 9h12v3H6V9zm1.5 8c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
        </svg>
      `
      break
    case 'trolleybus':
      // Trolleybus icon (bus with antenna)
      iconSvg = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zM6 9h12v3H6V9zm1.5 8c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
          <path d="M10 1L8 4h2V1zm4 0v3h2l-2-3z"/>
        </svg>
      `
      break
    default:
      // Generic vehicle icon
      iconSvg = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M12 2L4 6v10l8 4 8-4V6l-8-4zm0 2.18l5.5 2.75L12 9.68 6.5 6.93 12 4.18zM6 8.93l5 2.5V19l-5-2.5V8.93zm7 10.07v-7.57l5-2.5V16.5l-5 2.5z"/>
        </svg>
      `
  }

  return L.divIcon({
    className: 'vehicle-marker',
    html: `
      <div class="vehicle-marker-inner" style="background-color: ${color}">
        ${iconSvg}
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
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

// Custom route stop icon with color coding
const createRouteStopIcon = (status = 'future') => {
  const colors = {
    past: '#888888',      // Gray for past stops
    current: '#9de67a',   // Green for current stop
    next: '#4ad1ff',      // Bright blue for next stop
    future: '#5a9fd4',    // Regular blue for future stops
    selected: '#9de67a'   // Green for the user's selected origin stop
  }

  const color = colors[status] || colors.future
  const size = status === 'current' || status === 'next' ? 20 : 16
  const outerSize = status === 'current' || status === 'next' ? 28 : 24

  return L.divIcon({
    className: `route-stop-marker route-stop-marker--${status}`,
    html: `
      <div class="route-stop-marker-inner" style="background-color: ${color}">
        <svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="white">
          <circle cx="8" cy="8" r="5"/>
        </svg>
      </div>
    `,
    iconSize: [outerSize, outerSize],
    iconAnchor: [outerSize / 2, outerSize / 2],
  })
}

const initMap = () => {
  if (map.value) return

  // Initialize map centered on Prague
  // Use markRaw to prevent Vue from making the Leaflet map reactive
  map.value = markRaw(
    L.map(mapContainer.value, {
      zoomControl: true,
      preferCanvas: true, // Use Canvas renderer instead of SVG to prevent polyline rendering errors during zoom
    }).setView([50.0755, 14.4378], 13)
  )

  updateTileLayer()

  // Listen for user interactions to prevent auto-recentering
  map.value.on('dragstart', () => {
    userInteractedWithMap = true
    showResetView.value = true
  })

  map.value.on('zoomstart', () => {
    // Mark as user interaction on any zoom
    // This prevents auto-recentering from resetting user's zoom level
    userInteractedWithMap = true
    showResetView.value = true
  })

  // Redisplay route stops and update vehicle position after zoom animation completes
  map.value.on('zoomend', () => {
    // Use setTimeout to ensure zoom animation is fully complete
    setTimeout(() => {
      if (routeStops.value && routeStops.value.length > 0) {
        displayRouteStops()
      }
      // Also update vehicle position (which updates route line)
      if (vehicleData.value) {
        updateVehiclePosition()
      }
    }, 50)
  })
}

const updateTileLayer = () => {
  if (!map.value) {
    return
  }

  // Remove existing tile layer if present
  if (currentTileLayer) {
    map.value.removeLayer(currentTileLayer)
  }

  // Check if dark mode is active
  const isDark = themeStore.theme === 'dark'

  // Add tile layer - use dark tiles if in dark mode
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  const attribution = isDark
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

  currentTileLayer = L.tileLayer(tileUrl, {
    attribution: attribution,
    maxZoom: 18,
  }).addTo(map.value)
}

const updateVehiclePosition = () => {
  if (!vehicleData.value || !map.value) return

  const { lat, lon } = vehicleData.value
  if (!lat || !lon) return

  const position = [lat, lon]
  const color = transportMeta.value?.color || '#666'
  const transportType = vehicleData.value.vehicleType || transportMeta.value?.type || 'bus'

  // Always update markers and lines, but only adjust map bounds if user hasn't interacted
  // This ensures the line connecting stop and vehicle updates in real-time

  // Update or create vehicle marker (always update position)
  if (vehicleMarker.value) {
    vehicleMarker.value.setLatLng(position)
    vehicleMarker.value.setIcon(createVehicleIcon(color, transportType))
  } else {
    vehicleMarker.value = L.marker(position, {
      icon: createVehicleIcon(color, transportType),
      zIndexOffset: 1000,
    }).addTo(map.value)

    vehicleMarker.value.bindPopup(`
      <strong>${vehicleData.value.line || 'Vehicle'}</strong><br>
      ${vehicleData.value.destination || 'Unknown destination'}<br>
      <small>Real-time position</small>
    `)
  }

  // Skip route line updates during zoom animations to avoid _latLngToNewLayerPoint errors
  if (map.value._animatingZoom || map.value._zooming) {
    lastUpdate.value = new Date()
    return
  }

  // Draw actual route line if geometry is available (no more dashed lines since we show all stops)
  let routeCoords = null
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

  // Only draw route line if we have actual route geometry
  if (isActualRoute && routeCoords) {
    try {
      if (routeLine.value) {
        // Update existing line
        routeLine.value.setLatLngs(routeCoords)
        routeLine.value.setStyle({
          color: color,
          weight: 4,
          opacity: 0.7,
        })
      } else {
        // Create new line - use markRaw to prevent Vue reactivity on Leaflet objects
        routeLine.value = markRaw(
          L.polyline(routeCoords, {
            color: color,
            weight: 4,
            opacity: 0.7,
            lineCap: 'round',
            lineJoin: 'round',
            interactive: true,
          }).addTo(map.value)
        )

        routeLine.value.bindPopup(`
          <strong>Route Path</strong><br>
          <small>Full route geometry</small>
        `)
      }
    } catch (e) {
      // Ignore errors during zoom animation
    }
  } else {
    // Remove route line if no geometry available
    if (routeLine.value && map.value) {
      try {
        map.value.removeLayer(routeLine.value)
        routeLine.value = null
      } catch (e) {
        // Ignore errors
      }
    }
  }

  // Only adjust map view on initial load or if user hasn't interacted
  if (!initialBoundsSet || !userInteractedWithMap) {
    // Collect all points for bounds calculation
    let boundsPoints = [position]

    // Only include the selected stop (not all route stops)
    if (store.selectedStop) {
      boundsPoints.push([store.selectedStop.lat, store.selectedStop.lon])
    }

    if (boundsPoints.length > 1) {
      const bounds = L.latLngBounds(boundsPoints)

      // Adjust padding based on screen size
      const isMobile = window.innerWidth <= 768

      const paddingOptions = isMobile
        ? {
            paddingTopLeft: [20, 40],
            paddingBottomRight: [20, 40],
            maxZoom: 16,
          }
        : {
            paddingTopLeft: [80, 80],
            paddingBottomRight: [380, 80],
            maxZoom: 17,
          }

      map.value.fitBounds(bounds, paddingOptions)
    } else {
      // Only vehicle position, center on it
      map.value.setView(position, 15)
    }

    initialBoundsSet = true
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

    // Fetch all route stops for display on map
    await fetchAllRouteStops()

    // Display route stops on map
    displayRouteStops()

    // Fetch arrival time for selected stop
    await fetchSelectedStopArrival()

    // Set up auto-refresh every 3 seconds
    updateTimer.value = setInterval(async () => {
      try {
        await store.fetchVehiclePosition(tripId.value)
        updateVehiclePosition()
        // Update stop markers color coding based on vehicle progress
        updateRouteStopsDisplay()
        trackingError.value = null
      } catch (error) {
        // Check if it's a "not found" error
        if (error.isNotFound || error.message === 'VEHICLE_NOT_FOUND' || store.vehicleError === 'VEHICLE_NOT_FOUND') {
          trackingError.value = 'VEHICLE_NOT_FOUND'
        } else {
          trackingError.value = 'Failed to update vehicle position'
        }
      }
    }, 1000)
  } catch (error) {
    // Check if it's a "not found" error
    if (error.isNotFound || error.message === 'VEHICLE_NOT_FOUND' || store.vehicleError === 'VEHICLE_NOT_FOUND') {
      trackingError.value = 'VEHICLE_NOT_FOUND'
    } else {
      trackingError.value = error.message || 'Failed to start tracking'
    }
  }
}

const stopTracking = () => {
  if (updateTimer.value) {
    clearInterval(updateTimer.value)
    updateTimer.value = null
  }
  store.clearVehicleTracking()
}

const updateUserMarker = (lat, lon, fitBounds = false) => {
  userLocation.value = { lat, lon }

  // Remove existing user marker if any
  if (userMarker && map.value) {
    map.value.removeLayer(userMarker)
  }

  // Add user location marker
  if (map.value) {
    userMarker = L.marker([lat, lon], {
      icon: L.divIcon({
        className: 'user-location-marker',
        html: '<span class="user-location-marker__dot"></span>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
      zIndexOffset: 950,
    }).addTo(map.value)

    userMarker.bindPopup(`
      <strong>Your Location</strong><br>
      <small>Current position</small>
    `)

    // Update map bounds to include user location only if requested
    if (fitBounds) {
      const points = [[lat, lon]]

      if (vehicleData.value) {
        points.push([vehicleData.value.lat, vehicleData.value.lon])
      }

      if (store.selectedStop) {
        points.push([store.selectedStop.lat, store.selectedStop.lon])
      }

      if (points.length > 1) {
        const bounds = L.latLngBounds(points)
        const isMobile = window.innerWidth <= 768

        const paddingOptions = isMobile
          ? {
              paddingTopLeft: [20, 40],
              paddingBottomRight: [20, 40],
              maxZoom: 16,
            }
          : {
              paddingTopLeft: [80, 80],
              paddingBottomRight: [380, 80],
              maxZoom: 16,
            }

        map.value.fitBounds(bounds, paddingOptions)
      } else {
        map.value.setView([lat, lon], 15)
      }
    }
  }
}

const startWatchingUserLocation = async () => {
  if (!navigator.geolocation) return

  // Check if we have permission before requesting location
  // This prevents prompting the user on page load
  if (navigator.permissions) {
    try {
      const permissionStatus = await navigator.permissions.query({ name: 'geolocation' })

      // Only start watching if permission was already granted
      if (permissionStatus.state === 'granted') {
        // Get initial position
        navigator.geolocation.getCurrentPosition(
          (position) => {
            updateUserMarker(position.coords.latitude, position.coords.longitude, false)
          },
          () => {
            // Silently fail
          },
          { timeout: 5000, maximumAge: 60000 }
        )

        // Watch position for continuous updates
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            updateUserMarker(position.coords.latitude, position.coords.longitude, false)
          },
          () => {
            // Silently fail - marker just won't update
          },
          { enableHighAccuracy: false, maximumAge: 30000 }
        )
      }
      // If permission is 'prompt' or 'denied', do nothing - user can click button
    } catch (error) {
      // Permissions API not supported, don't auto-request location
      // User can still click the button to request it
    }
  }
  // If Permissions API is not available, don't auto-request location
}

const stopWatchingUserLocation = () => {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
  }
}

const resetView = () => {
  userInteractedWithMap = false
  showResetView.value = false
  // Trigger a re-fit of the bounds
  updateVehiclePosition()
}

const showUserLocation = () => {
  if (!navigator.geolocation) {
    trackingError.value = t('geolocation.notSupported')
    return
  }

  locatingUser.value = true

  navigator.geolocation.getCurrentPosition(
    (position) => {
      // User explicitly clicked the button, so allow recentering
      userInteractedWithMap = false
      showResetView.value = false
      updateUserMarker(position.coords.latitude, position.coords.longitude, true)
      locatingUser.value = false

      // Start continuous location watching if not already watching
      if (watchId === null) {
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            updateUserMarker(position.coords.latitude, position.coords.longitude, false)
          },
          () => {
            // Silently fail - marker just won't update
          },
          { enableHighAccuracy: false, maximumAge: 30000 }
        )
      }
    },
    (error) => {
      locatingUser.value = false
      let errorMsg = t('geolocation.genericError')

      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMsg = t('geolocation.denied')
          break
        case error.POSITION_UNAVAILABLE:
          errorMsg = t('geolocation.unavailable')
          break
        case error.TIMEOUT:
          errorMsg = t('geolocation.timeout')
          break
      }

      trackingError.value = errorMsg
      setTimeout(() => {
        if (trackingError.value === errorMsg) {
          trackingError.value = null
        }
      }, 5000)
    }
  )
}

const goBack = () => {
  stopTracking()

  // Clear selection temporarily so that when we navigate back,
  // the HomeView's selectFromRoute will trigger a fresh selection
  // and the map will properly highlight the stop
  const nodeToNavigate = stopNode.value
  store.clearSelection()

  // Navigate back to stop page using node from route
  if (nodeToNavigate) {
    router.push({ name: 'stop', params: { node: nodeToNavigate } }).then(() => {
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

    // Fetch next stop name if available
    if (vehicleData.value.nextStop?.id) {
      fetchNextStopName(vehicleData.value.nextStop.id)
    }

    // Fetch current/last stop name if available
    if (vehicleData.value.lastStop?.id) {
      fetchCurrentStopName(vehicleData.value.lastStop.id)
    }

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

watch(
  () => themeStore.theme,
  () => {
    updateTileLayer()
  }
)

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
  startWatchingUserLocation()
})

onUnmounted(() => {
  stopTracking()
  stopWatchingUserLocation()
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
        {{ t('vehicleTracker.backButton') }}
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
        <span v-if="transportTypeLabel" class="transport-type-label">{{ transportTypeLabel }}</span>
        <span class="destination">→ {{ vehicleData.destination }}</span>
      </div>

      <div v-else class="vehicle-info">
        <span class="loading-text">{{ t('vehicleTracker.loadingVehicle') }}</span>
      </div>

      <button
        v-if="!userLocation"
        @click.stop="showUserLocation"
        :disabled="locatingUser"
        class="locate-button"
        :class="{ 'locate-button--loading': locatingUser }"
        aria-label="Show my location"
        title="Show my location on map"
      >
        <svg
          v-if="!locatingUser"
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="spinner"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
        </svg>
        <span class="locate-button__text">{{ locatingUser ? t('vehicleTracker.locating') : t('vehicleTracker.myLocation') }}</span>
      </button>
    </header>

    <div class="tracker-content" :class="{ 'tracker-content--no-data': trackingError === 'VEHICLE_NOT_FOUND' }">
      <div v-if="trackingError !== 'VEHICLE_NOT_FOUND'" class="tracker-map-wrapper">
        <div ref="mapContainer" class="tracker-map"></div>

        <button
          v-if="showResetView"
          @click="resetView"
          class="reset-view-button"
          aria-label="Re-center map on vehicle"
          title="Re-center map on vehicle"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span class="reset-view-button__text">{{ t('vehicleTracker.reCenter') }}</span>
        </button>
      </div>

      <aside class="tracker-sidebar" :class="{ 'tracker-sidebar--full-width': trackingError === 'VEHICLE_NOT_FOUND' }">
        <div v-if="trackingError === 'VEHICLE_NOT_FOUND'" class="tracker-not-found" role="alert">
          <h3>{{ t('vehicleTracker.noTrackingData') }}</h3>
          <p>{{ t('vehicleTracker.noTrackingDataDescription') }}</p>
          <button class="primary back-button-cta" @click="goBack">
            {{ t('vehicleTracker.goBackToStop') }}
          </button>
        </div>

        <div v-else-if="trackingError" class="tracker-error" role="alert">
          <p>{{ trackingError }}</p>
        </div>

        <div v-else-if="vehicleData" class="tracker-details">
          <div class="detail-section">
            <h3>{{ t('vehicleTracker.status') }}</h3>
            <p class="status-label" :class="statusBadgeClass">
              {{ statusLabel }}
            </p>
            <p v-if="vehicleData.isCanceled" class="warning-text" style="margin-top: 0.5rem;">
              {{ t('vehicleTracker.serviceCanceled') }}
            </p>
          </div>

          <div v-if="store.selectedStop && selectedStopArrivalTime" class="detail-section selected-stop-highlight">
            <h3>{{ t('vehicleTracker.yourStop') }}</h3>
            <p class="selected-stop-name">{{ store.selectedStop.displayName }}</p>
            <div class="selected-stop-time">
              <span v-if="selectedStopTime" class="time">{{ selectedStopTime }}</span>
              <span v-if="minutesToSelectedStop !== null" class="countdown">
                <template v-if="minutesToSelectedStop > 0">{{ t('vehicleTracker.time.inMinutes', { minutes: minutesToSelectedStop }) }}</template>
                <template v-else-if="minutesToSelectedStop === 0">{{ t('vehicleTracker.time.arrivingNow') }}</template>
                <template v-else>{{ t('vehicleTracker.time.departedAgo', { minutes: Math.abs(minutesToSelectedStop) }) }}</template>
              </span>
            </div>
          </div>

          <div v-if="vehicleData.lastStop && vehicleData.isTracking" class="detail-section current-stop-highlight">
            <h3>{{ t('vehicleTracker.currentStop') }}</h3>
            <p class="current-stop-name">{{ currentStopName || t('common.loading') }}</p>
            <div class="current-stop-time">
              <span v-if="currentStopTime" class="time">{{ currentStopTime }}</span>
              <span v-if="minutesToCurrentStop !== null" class="countdown">
                <template v-if="minutesToCurrentStop > 0">{{ t('vehicleTracker.time.inMinutes', { minutes: minutesToCurrentStop }) }}</template>
                <template v-else-if="minutesToCurrentStop === 0">{{ t('vehicleTracker.time.arrivingNow') }}</template>
                <template v-else>{{ t('vehicleTracker.time.ago', { minutes: Math.abs(minutesToCurrentStop) }) }}</template>
              </span>
            </div>
          </div>

          <div v-if="vehicleData.nextStop" class="detail-section next-stop-highlight">
            <h3>{{ t('vehicleTracker.nextStop') }}</h3>
            <p class="next-stop-name">{{ nextStopName || t('common.loading') }}</p>
            <div class="next-stop-time">
              <span v-if="nextStopTime" class="time">{{ nextStopTime }}</span>
              <span v-if="minutesToNextStop !== null" class="countdown">
                {{ t('vehicleTracker.time.inMinutes', { minutes: minutesToNextStop }) }}
              </span>
            </div>
          </div>

          <div v-if="transportTypeLabel || vehicleData.vehicleNumber || vehicleData.wheelchairAccessible || vehicleData.airConditioned || vehicleData.usbChargers" class="detail-section">
            <h3>{{ t('vehicleTracker.vehicle') }}</h3>
            <div v-if="transportTypeLabel || vehicleData.vehicleNumber" class="vehicle-info-row">
              <p v-if="transportTypeLabel" class="vehicle-type">
                <strong>{{ t('vehicleTracker.type') }}:</strong> {{ transportTypeLabel }}
              </p>
              <p v-if="vehicleData.vehicleNumber" class="vehicle-number">
                <strong>{{ t('vehicleTracker.id') }}:</strong> #{{ vehicleData.vehicleNumber }}
              </p>
            </div>

            <div v-if="vehicleData.wheelchairAccessible || vehicleData.airConditioned || vehicleData.usbChargers" class="amenities">
              <span v-if="vehicleData.wheelchairAccessible" class="amenity-badge" :title="t('vehicleTracker.amenities.accessible')">
                {{ t('vehicleTracker.amenities.accessible') }}
              </span>
              <span v-if="vehicleData.airConditioned" class="amenity-badge" :title="t('vehicleTracker.amenities.ac')">
                {{ t('vehicleTracker.amenities.ac') }}
              </span>
              <span v-if="vehicleData.usbChargers" class="amenity-badge" :title="t('vehicleTracker.amenities.usb')">
                {{ t('vehicleTracker.amenities.usb') }}
              </span>
            </div>
          </div>

          <div v-if="bearingLabel || vehicleData.speed" class="detail-section">
            <h3>{{ t('vehicleTracker.movement') }}</h3>
            <div class="movement-grid">
              <div v-if="bearingLabel" class="movement-item">
                <span class="movement-label">{{ t('vehicleTracker.heading') }}</span>
                <span class="movement-value">{{ bearingLabel }}</span>
              </div>
              <div v-if="vehicleData.speed" class="movement-item">
                <span class="movement-label">{{ t('vehicleTracker.speed') }}</span>
                <span class="movement-value">{{ Math.round(vehicleData.speed) }} km/h</span>
              </div>
            </div>
          </div>

          <div v-if="distanceToStop || distanceFromUser" class="detail-section">
            <h3>{{ t('vehicleTracker.distance') }}</h3>
            <div v-if="distanceToStop" class="distance-item">
              <p class="distance-value">{{ distanceToStop }}</p>
              <p class="caption">
                <template v-if="store.selectedStop?.displayName">
                  {{ t('vehicleTracker.fromStop', { stop: store.selectedStop.displayName }) }}
                </template>
                <template v-else>
                  {{ t('vehicleTracker.fromOriginStop') }}
                </template>
              </p>
            </div>
            <div v-if="distanceFromUser" class="distance-item" style="margin-top: 0.5rem">
              <p class="distance-value">{{ distanceFromUser }}</p>
              <p class="caption">{{ t('vehicleTracker.fromYourLocation') }}</p>
            </div>
          </div>

          <div class="detail-section">
            <h3>{{ t('vehicleTracker.lastUpdate') }}</h3>
            <p>{{ lastUpdateLabel }}</p>
            <p v-if="!vehicleData.isTracking" class="caption warning-text" style="margin-top: 0.5rem;">
              {{ t('vehicleTracker.trackingNotActive') }}
            </p>
          </div>
        </div>

        <div v-else-if="isLoading" class="tracker-placeholder">
          <p>{{ t('vehicleTracker.locatingVehicle') }}</p>
        </div>

        <div class="tracker-info">
          <p class="caption">
            {{ t('vehicleTracker.footer') }}
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
  flex-wrap: wrap;
}

.tracker-header:hover {
  background: rgba(157, 230, 122, 0.08);
}

.back-button {
  font-size: 0.9rem;
  flex-shrink: 0;
}

.vehicle-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}

.loading-text {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.line-code {
  font-weight: 600;
  font-size: 1.1rem;
}

.transport-type-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.2rem 0.5rem;
  background: rgba(157, 230, 122, 0.15);
  border: 1px solid rgba(157, 230, 122, 0.3);
  border-radius: 0.25rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.destination {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.locate-button {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(157, 230, 122, 0.15);
  border: 1px solid rgba(157, 230, 122, 0.3);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-primary);
}

.locate-button:hover {
  background: rgba(157, 230, 122, 0.25);
  border-color: rgba(157, 230, 122, 0.5);
}

.locate-button--loading {
  opacity: 0.7;
  cursor: wait;
}

.locate-button__text {
  line-height: 1;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.tracker-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.tracker-content--no-data {
  justify-content: center;
  align-items: center;
}

.tracker-map-wrapper {
  flex: 1;
  position: relative;
}

.tracker-map {
  width: 100%;
  height: 100%;
}

.reset-view-button {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 1rem;
  background-color: rgba(214, 255, 208, 0.95);
  border: 1px solid #9de67a;
  border-radius: 24px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #041804;
  font-weight: 600;
  font-size: 0.9rem;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  backdrop-filter: blur(8px);
}

.reset-view-button:hover {
  background-color: rgba(157, 230, 122, 0.98);
  border-color: #7bc961;
  transform: translateX(-50%) translateY(-2px);
  box-shadow: 0 4px 16px rgba(157, 230, 122, 0.4);
}

.reset-view-button:active {
  transform: translateX(-50%) translateY(0);
}

.reset-view-button__text {
  line-height: 1;
}

.dark .reset-view-button {
  background-color: rgba(4, 24, 4, 0.95);
  border-color: #9de67a;
  color: #9de67a;
}

.dark .reset-view-button:hover {
  background-color: rgba(10, 42, 8, 0.98);
  border-color: #d6ffd0;
  color: #d6ffd0;
  box-shadow: 0 4px 16px rgba(157, 230, 122, 0.3);
}

.tracker-sidebar {
  width: 280px;
  background: var(--surface-base);
  border-left: 1px solid var(--border-subtle);
  padding: 1rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tracker-sidebar--full-width {
  width: 100%;
  max-width: 600px;
  border-left: none;
  justify-content: center;
}

.tracker-error {
  padding: 1rem;
  background: var(--error-surface, #ff000015);
  border: 1px solid var(--error-border, #ff000033);
  border-radius: 0.5rem;
  color: var(--error-text, #ff4444);
}

.tracker-not-found {
  padding: 1.5rem;
  background: var(--surface-dark);
  border: 1px solid var(--border-subtle);
  border-radius: 0.5rem;
  text-align: center;
}

.tracker-not-found h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 0.75rem 0;
}

.tracker-not-found p {
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0 0 1.25rem 0;
}

.back-button-cta {
  width: 100%;
  padding: 0.75rem 1.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  background: rgba(157, 230, 122, 0.15);
  border: 1px solid rgba(157, 230, 122, 0.3);
  border-radius: 0.5rem;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.back-button-cta:hover {
  background: rgba(157, 230, 122, 0.25);
  border-color: rgba(157, 230, 122, 0.5);
}

.tracker-details {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.detail-section h3 {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  margin: 0 0 0.35rem 0;
  font-weight: 600;
}

.detail-section p {
  font-size: 0.9rem;
  color: var(--text-primary);
  margin: 0;
}

.status-label {
  font-weight: 600;
  padding: 0.35rem 0.6rem;
  border-radius: 0.3rem;
  display: inline-block;
  font-size: 0.85rem;
}

.status-ontime {
  background: var(--success-surface, #00ff0015);
  border: 1px solid var(--success-border, #00ff0033);
  color: var(--success-text, #00ff00);
}

.status-delayed {
  background: var(--warning-surface, #ff880015);
  border: 1px solid var(--warning-border, #ff880033);
  color: var(--warning-text, #ff8800);
}

.status-early {
  background: var(--info-surface, #0088ff15);
  border: 1px solid var(--info-border, #0088ff33);
  color: var(--info-text, #0088ff);
}

.status-canceled {
  background: var(--error-surface, #ff000015);
  border: 1px solid var(--error-border, #ff000033);
  color: var(--error-text, #ff4444);
}

.coords {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.distance-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.tracker-placeholder {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--text-secondary);
}

.tracker-info {
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid var(--border-subtle);
}

.caption {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  line-height: 1.3;
  margin: 0;
}

/* Vehicle marker styles */
:deep(.vehicle-marker) {
  background: none;
  border: none;
}

:deep(.vehicle-marker-inner) {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4), 0 0 0 3px rgba(255, 255, 255, 0.8);
  border: 3px solid white;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  animation: vehicle-pulse 2s ease-in-out infinite;
}

:deep(.vehicle-marker:hover .vehicle-marker-inner) {
  transform: scale(1.1);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5), 0 0 0 4px rgba(255, 255, 255, 0.9);
}

@keyframes vehicle-pulse {
  0%, 100% {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4), 0 0 0 3px rgba(255, 255, 255, 0.8);
  }
  50% {
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5), 0 0 0 5px rgba(157, 230, 122, 0.6);
  }
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

/* Route stop markers */
:deep(.route-stop-marker) {
  background: none;
  border: none;
}

:deep(.route-stop-marker-inner) {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

:deep(.route-stop-marker:hover .route-stop-marker-inner) {
  transform: scale(1.15);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.35);
}

/* Special styling for current and next stops */
:deep(.route-stop-marker--current .route-stop-marker-inner),
:deep(.route-stop-marker--next .route-stop-marker-inner) {
  border-width: 3px;
  box-shadow: 0 3px 12px rgba(157, 230, 122, 0.4);
}

:deep(.route-stop-marker--selected .route-stop-marker-inner) {
  border-width: 3px;
  border-color: #9de67a;
  box-shadow: 0 3px 12px rgba(157, 230, 122, 0.5);
  animation: pulse-stop 2s ease-in-out infinite;
}

@keyframes pulse-stop {
  0%, 100% {
    box-shadow: 0 3px 12px rgba(157, 230, 122, 0.5);
  }
  50% {
    box-shadow: 0 3px 16px rgba(157, 230, 122, 0.8);
  }
}

/* Leaflet polyline styling */
:deep(.leaflet-interactive) {
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
}

/* New UI elements */
.selected-stop-highlight {
  background: linear-gradient(135deg, rgba(157, 230, 122, 0.15) 0%, rgba(157, 230, 122, 0.05) 100%);
  padding: 1rem;
  border-radius: 0.5rem;
  border: 2px solid rgba(157, 230, 122, 0.5);
  box-shadow: 0 2px 8px rgba(157, 230, 122, 0.1);
}

.selected-stop-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 0.5rem 0;
}

.selected-stop-time {
  display: flex;
  gap: 0.75rem;
  align-items: baseline;
  margin-top: 0.5rem;
}

.selected-stop-time .time {
  font-size: 1.4rem;
  font-weight: 800;
  color: #9de67a;
}

.selected-stop-time .countdown {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  padding: 0.3rem 0.6rem;
  background: rgba(157, 230, 122, 0.2);
  border: 1px solid rgba(157, 230, 122, 0.3);
  border-radius: 0.3rem;
}

.current-stop-highlight {
  background: var(--surface-dark);
  padding: 0.75rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(157, 230, 122, 0.3);
  border-left: 3px solid rgba(157, 230, 122, 0.6);
}

.current-stop-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 0.4rem 0;
}

.current-stop-time {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  margin-top: 0.4rem;
}

.current-stop-time .time {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
}

.current-stop-time .countdown {
  font-size: 0.85rem;
  color: var(--text-secondary);
  padding: 0.2rem 0.4rem;
  background: var(--surface-base);
  border-radius: 0.25rem;
}

.next-stop-highlight {
  background: var(--surface-dark);
  padding: 0.75rem;
  border-radius: 0.4rem;
  border: 1px solid var(--border-subtle);
}

.next-stop-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 0.4rem 0;
}

.next-stop-time {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  margin-top: 0.4rem;
}

.next-stop-time .time {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
}

.next-stop-time .countdown {
  font-size: 0.85rem;
  color: var(--text-secondary);
  padding: 0.2rem 0.4rem;
  background: var(--surface-base);
  border-radius: 0.25rem;
}

.vehicle-info-row {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}

.vehicle-type,
.vehicle-number {
  font-size: 0.9rem;
  color: var(--text-primary);
  margin: 0;
}

.vehicle-type strong,
.vehicle-number strong {
  color: var(--text-tertiary);
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.amenities {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.amenity-badge {
  font-size: 0.7rem;
  padding: 0.2rem 0.4rem;
  background: var(--surface-dark);
  border: 1px solid var(--border-subtle);
  border-radius: 0.25rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.movement-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.movement-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.movement-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  font-weight: 600;
}

.movement-value {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
}

.warning-text {
  color: var(--warning-text, #ff8800);
  font-style: italic;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .tracker-header {
    padding: 0.75rem 1rem;
    gap: 0.75rem;
  }

  .back-button {
    font-size: 0.85rem;
    padding: 0.4rem 0.8rem;
  }

  .vehicle-info {
    gap: 0.5rem;
    flex: 1 1 100%;
    order: 2;
  }

  .locate-button {
    order: 1;
    margin-left: auto;
  }

  .line-code {
    font-size: 1rem;
  }

  .transport-type-label {
    font-size: 0.7rem;
    padding: 0.15rem 0.4rem;
  }

  .destination {
    flex: 1 1 100%;
    font-size: 0.9rem;
  }

  .tracker-content {
    flex-direction: column;
  }

  .tracker-map-wrapper {
    height: 50vh;
  }

  .tracker-map {
    width: 100%;
    height: 100%;
  }

  .reset-view-button {
    bottom: 10px;
    font-size: 0.85rem;
    padding: 0.5rem 0.85rem;
  }

  .tracker-sidebar {
    width: 100%;
    border-left: none;
    border-top: 1px solid var(--border-subtle);
    max-height: 50vh;
  }

  .tracker-sidebar--full-width {
    border-top: none;
    max-height: none;
  }

  .movement-grid {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
}

@media (max-width: 480px) {
  .tracker-header {
    padding: 0.65rem 0.75rem;
  }

  .vehicle-info {
    gap: 0.4rem;
  }

  .transport-chip {
    font-size: 0.75rem;
    padding: 0.15rem 0.3rem;
  }

  .line-code {
    font-size: 0.95rem;
  }

  .transport-type-label {
    display: none;
  }

  .destination {
    font-size: 0.85rem;
  }

  .locate-button__text {
    display: none;
  }

  .locate-button {
    padding: 0.5rem;
    min-width: 36px;
    min-height: 36px;
    justify-content: center;
  }
}
</style>
