<script setup>
import { ref, onMounted, onUnmounted, computed, watch, markRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTimetableStore } from '../stores/timetableStore'
import { useThemeStore } from '../stores/themeStore'
import { getTransportMeta } from '../utils/transport'
import axios from 'axios'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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
let currentTileLayer = null
let userMarker = null
let watchId = null
let userInteractedWithMap = false
let initialBoundsSet = false

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
  if (bearing >= 337.5 || bearing < 22.5) return 'N'
  if (bearing >= 22.5 && bearing < 67.5) return 'NE'
  if (bearing >= 67.5 && bearing < 112.5) return 'E'
  if (bearing >= 112.5 && bearing < 157.5) return 'SE'
  if (bearing >= 157.5 && bearing < 202.5) return 'S'
  if (bearing >= 202.5 && bearing < 247.5) return 'SW'
  if (bearing >= 247.5 && bearing < 292.5) return 'W'
  if (bearing >= 292.5 && bearing < 337.5) return 'NW'
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

  // Try to fetch from GTFS API as a last resort
  try {
    const headers = {
      Accept: 'application/json',
    }

    // Only send API key in dev mode
    if (import.meta.env.DEV && import.meta.env.VITE_GOLEMIO_API_KEY) {
      headers['X-Access-Token'] = import.meta.env.VITE_GOLEMIO_API_KEY
    }

    // Fetch trip stop times from Golemio API
    let endpoint
    let params = {}

    if (import.meta.env.DEV) {
      endpoint = `/golemio/v2/gtfs/trips/${encodeURIComponent(tripId.value)}/stoptimes`
    } else {
      endpoint = '/api/golemio'
      params.path = `gtfs/trips/${encodeURIComponent(tripId.value)}/stoptimes`
    }

    const { data } = await axios.get(endpoint, {
      headers,
      params,
      timeout: 15000,
    })

    // Find the stop time for our selected stop
    // Match by GTFS ID from the selected stop
    const stopTimes = data.stop_times || data.stopTimes || []

    if (store.selectedStop.gtfsIds && store.selectedStop.gtfsIds.length > 0) {
      const stopTime = stopTimes.find(st => {
        const stopId = st.stop_id || st.stop?.stop_id
        return store.selectedStop.gtfsIds.some(gtfsId => {
          return stopId === gtfsId || stopId?.replace(/P$/, '') === gtfsId || gtfsId?.replace(/P$/, '') === stopId
        })
      })

      if (stopTime) {
        // Get arrival time - prefer actual/predicted over scheduled
        selectedStopArrivalTime.value =
          stopTime.arrival_time?.predicted ||
          stopTime.arrival_time?.actual ||
          stopTime.arrival_time?.scheduled ||
          stopTime.arrival_time ||
          null
      } else {
        selectedStopArrivalTime.value = null
      }
    } else {
      selectedStopArrivalTime.value = null
    }
  } catch (error) {
    // If all methods fail, we just won't show the selected stop section
    selectedStopArrivalTime.value = null
  }
}

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

  map.value.on('zoomstart', (e) => {
    // Only mark as user interaction if it's not programmatic
    // Leaflet doesn't provide a direct way to distinguish, but we can check
    // if the zoom was triggered by user (wheel/buttons) vs fitBounds
    if (!e.originalEvent && !map.value._animatingZoom) return
    userInteractedWithMap = true
    showResetView.value = true
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

  // Always update markers and lines, but only adjust map bounds if user hasn't interacted
  // This ensures the line connecting stop and vehicle updates in real-time

  // Update or create vehicle marker (always update position)
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

    // Always update the route line (even when user has interacted)
    if (routeLine.value) {
      // Update existing line
      routeLine.value.setLatLngs(routeCoords)
      routeLine.value.setStyle({
        color: color,
        weight: isActualRoute ? 4 : 5,
        opacity: isActualRoute ? 0.9 : 0.8,
        dashArray: isActualRoute ? null : '12, 8',
      })

      // Update popup with current distance
      routeLine.value.setPopupContent(`
        <strong>Distance:</strong> ${distance} km<br>
        <small>${isActualRoute ? 'Actual route path' : 'Direct line from stop to vehicle'}</small>
      `)
    } else {
      // Create new line - use markRaw to prevent Vue reactivity on Leaflet objects
      routeLine.value = markRaw(
        L.polyline(routeCoords, {
          color: color,
          weight: isActualRoute ? 4 : 5,
          opacity: isActualRoute ? 0.9 : 0.8,
          dashArray: isActualRoute ? null : '12, 8',
          lineCap: 'round',
          lineJoin: 'round',
          interactive: true,
        }).addTo(map.value)
      )

      routeLine.value.bindPopup(`
        <strong>Distance:</strong> ${distance} km<br>
        <small>${isActualRoute ? 'Actual route path' : 'Direct line from stop to vehicle'}</small>
      `)
    }

    // Only adjust map view on initial load or if user hasn't interacted
    if (!initialBoundsSet || !userInteractedWithMap) {
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
      initialBoundsSet = true
    }
  } else if (!initialBoundsSet || !userInteractedWithMap) {
    // No stop selected, just center on vehicle (only on initial load)
    map.value.setView(position, 15)
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

    // Fetch arrival time for selected stop
    await fetchSelectedStopArrival()

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
    trackingError.value = 'Geolocation is not supported by your browser'
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
      let errorMsg = 'Failed to get your location'

      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMsg = 'Location access denied. Please enable location permissions.'
          break
        case error.POSITION_UNAVAILABLE:
          errorMsg = 'Location information unavailable.'
          break
        case error.TIMEOUT:
          errorMsg = 'Location request timed out.'
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
        <span class="locate-button__text">{{ locatingUser ? 'Locating...' : 'My Location' }}</span>
      </button>
    </header>

    <div class="tracker-content">
      <div class="tracker-map-wrapper">
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
          <span class="reset-view-button__text">Re-center</span>
        </button>
      </div>

      <aside class="tracker-sidebar">
        <div v-if="trackingError" class="tracker-error" role="alert">
          <p>{{ trackingError }}</p>
        </div>

        <div v-else-if="vehicleData" class="tracker-details">
          <div class="detail-section">
            <h3>Status</h3>
            <p class="status-label" :class="statusBadgeClass">
              {{ statusLabel }}
            </p>
            <p v-if="vehicleData.isCanceled" class="warning-text" style="margin-top: 0.5rem;">
              Service Canceled
            </p>
          </div>

          <div v-if="store.selectedStop && selectedStopArrivalTime" class="detail-section selected-stop-highlight">
            <h3>Your Stop</h3>
            <p class="selected-stop-name">{{ store.selectedStop.displayName }}</p>
            <div class="selected-stop-time">
              <span v-if="selectedStopTime" class="time">{{ selectedStopTime }}</span>
              <span v-if="minutesToSelectedStop !== null" class="countdown">
                <template v-if="minutesToSelectedStop > 0">in {{ minutesToSelectedStop }} min</template>
                <template v-else-if="minutesToSelectedStop === 0">arriving now</template>
                <template v-else>departed {{ Math.abs(minutesToSelectedStop) }} min ago</template>
              </span>
            </div>
          </div>

          <div v-if="vehicleData.lastStop && vehicleData.isTracking" class="detail-section current-stop-highlight">
            <h3>Current Stop</h3>
            <p class="current-stop-name">{{ currentStopName || 'Loading...' }}</p>
            <div class="current-stop-time">
              <span v-if="currentStopTime" class="time">{{ currentStopTime }}</span>
              <span v-if="minutesToCurrentStop !== null" class="countdown">
                <template v-if="minutesToCurrentStop > 0">in {{ minutesToCurrentStop }} min</template>
                <template v-else-if="minutesToCurrentStop === 0">arriving now</template>
                <template v-else>{{ Math.abs(minutesToCurrentStop) }} min ago</template>
              </span>
            </div>
          </div>

          <div v-if="vehicleData.nextStop" class="detail-section next-stop-highlight">
            <h3>Next Stop</h3>
            <p class="next-stop-name">{{ nextStopName || 'Loading...' }}</p>
            <div class="next-stop-time">
              <span v-if="nextStopTime" class="time">{{ nextStopTime }}</span>
              <span v-if="minutesToNextStop !== null" class="countdown">
                in {{ minutesToNextStop }} min
              </span>
            </div>
          </div>

          <div v-if="vehicleData.vehicleNumber || vehicleData.wheelchairAccessible || vehicleData.airConditioned || vehicleData.usbChargers" class="detail-section">
            <h3>Vehicle</h3>
            <p v-if="vehicleData.vehicleNumber" class="vehicle-number">
              #{{ vehicleData.vehicleNumber }}
            </p>

            <div v-if="vehicleData.wheelchairAccessible || vehicleData.airConditioned || vehicleData.usbChargers" class="amenities">
              <span v-if="vehicleData.wheelchairAccessible" class="amenity-badge" title="Wheelchair Accessible">
                ♿ Accessible
              </span>
              <span v-if="vehicleData.airConditioned" class="amenity-badge" title="Air Conditioned">
                ❄ AC
              </span>
              <span v-if="vehicleData.usbChargers" class="amenity-badge" title="USB Chargers">
                🔌 USB
              </span>
            </div>
          </div>

          <div v-if="bearingLabel || vehicleData.speed" class="detail-section">
            <h3>Movement</h3>
            <div class="movement-grid">
              <div v-if="bearingLabel" class="movement-item">
                <span class="movement-label">Heading</span>
                <span class="movement-value">{{ bearingLabel }}</span>
              </div>
              <div v-if="vehicleData.speed" class="movement-item">
                <span class="movement-label">Speed</span>
                <span class="movement-value">{{ Math.round(vehicleData.speed) }} km/h</span>
              </div>
            </div>
          </div>

          <div v-if="distanceToStop || distanceFromUser" class="detail-section">
            <h3>Distance</h3>
            <div v-if="distanceToStop" class="distance-item">
              <p class="distance-value">{{ distanceToStop }}</p>
              <p class="caption">from {{ store.selectedStop?.displayName || 'origin stop' }}</p>
            </div>
            <div v-if="distanceFromUser" class="distance-item" style="margin-top: 0.5rem">
              <p class="distance-value">{{ distanceFromUser }}</p>
              <p class="caption">from your location</p>
            </div>
          </div>

          <div class="detail-section">
            <h3>Last Update</h3>
            <p>{{ lastUpdateLabel }}</p>
            <p v-if="!vehicleData.isTracking" class="caption warning-text" style="margin-top: 0.5rem;">
              Real-time tracking not active
            </p>
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

.vehicle-number {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 0.5rem 0;
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

  .movement-grid {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
}
</style>
