<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import L from 'leaflet'
import 'leaflet.markercluster'
import { useTimetableStore } from '../stores/timetableStore'
import { useThemeStore } from '../stores/themeStore'
import { getTransportMeta, getTransportIconSvg, getUniqueTransportTypes } from '../utils/transport'

const { t } = useI18n()
const store = useTimetableStore()
const themeStore = useThemeStore()
const mapElement = ref(null)
const locatingUser = ref(false)
const locationError = ref(null)
const mapInitialized = ref(false)

let mapInstance
let markerLayer
let markers = new Map()
let currentTileLayer = null
let userMarker = null

const initMap = () => {
  if (mapInstance || !mapElement.value) {
    return
  }

  // Define PID service area bounds (covers entire Czech Republic)
  // Based on actual stop data: lat 49.01-50.95, lon 12.86-15.90
  const pidBounds = L.latLngBounds(
    L.latLng(48.9, 12.7),  // Southwest corner (with buffer)
    L.latLng(51.1, 16.0)   // Northeast corner (with buffer)
  )

  mapInstance = L.map(mapElement.value, {
    zoomControl: false,
    preferCanvas: true, // Use canvas for better performance
    maxBounds: pidBounds, // Restrict panning to PID service area
    maxBoundsViscosity: 1.0, // Make bounds strict (don't allow dragging outside)
    minZoom: 8, // Allow viewing entire Czech Republic
    maxZoom: 18, // Reasonable max zoom for transit stops
  }).setView([50.0755, 14.4378], 12)

  updateTileLayer()
  mapInitialized.value = true

  L.control
    .zoom({
      position: 'bottomright',
    })
    .addTo(mapInstance)

  markerLayer = L.markerClusterGroup({
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    disableClusteringAtZoom: 16,
  }).addTo(mapInstance)

  setTimeout(() => mapInstance.invalidateSize(), 600)
  renderMarkers()
}

const updateTileLayer = () => {
  if (!mapInstance) {
    return
  }

  // Remove existing tile layer if present
  if (currentTileLayer) {
    mapInstance.removeLayer(currentTileLayer)
  }

  // Check if dark mode is active
  const isDark = themeStore.theme === 'dark'

  // Use CartoDB tiles - lighter and faster than full OSM tiles
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'

  const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'

  currentTileLayer = L.tileLayer(tileUrl, {
    attribution: attribution,
    maxZoom: 18,
    // Performance optimizations
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 2,
    // Bounds to only load tiles for PID service area (Czech Republic)
    bounds: L.latLngBounds(L.latLng(48.9, 12.7), L.latLng(51.1, 16.0)),
  }).addTo(mapInstance)
}

const createMarkerIcon = (stop, isSelected = false) => {
  const transportTypes = getUniqueTransportTypes(stop.lines)

  // If multiple transport types, create a multi-icon marker
  if (transportTypes.length > 1) {
    const selectedClass = isSelected ? 'transport-marker__multi--selected' : ''
    const size = isSelected ? 50 : 42
    const anchor = isSelected ? 25 : 21
    const iconSize = isSelected ? 16 : 14

    const icons = transportTypes.slice(0, 3).map(type => {
      // For metro, try to find a line name to get correct color
      let lineName = null
      if (type.toLowerCase() === 'metro') {
        const metroLine = stop.lines.find(line =>
          line.type && line.type.toLowerCase() === 'metro'
        )
        lineName = metroLine ? metroLine.name : null
      }

      const meta = getTransportMeta(type, lineName)
      const svg = getTransportIconSvg(meta.label, iconSize)
      return `<span class="transport-marker__multi-icon" style="background: ${meta.color}">${svg}</span>`
    }).join('')

    return L.divIcon({
      className: 'transport-marker',
      html: `<div class="transport-marker__multi ${selectedClass}">
          ${icons}
        </div>`,
      iconSize: [size, size],
      iconAnchor: [anchor, anchor],
      tooltipAnchor: [0, -anchor],
    })
  }

  // Single transport type - use single icon
  const transportType = transportTypes[0] || stop.transportKey || stop.trafficType

  // For metro, try to find a line name to get correct color
  let lineName = null
  if (transportType && transportType.toLowerCase() === 'metro') {
    const metroLine = stop.lines.find(line =>
      line.type && line.type.toLowerCase() === 'metro'
    )
    lineName = metroLine ? metroLine.name : null
  }

  const meta = getTransportMeta(transportType, lineName)
  const selectedClass = isSelected ? 'transport-marker__icon--selected' : ''
  const size = isSelected ? 44 : 36
  const anchor = isSelected ? 22 : 18
  const iconSize = isSelected ? 22 : 18
  const iconSvg = getTransportIconSvg(meta.label, iconSize)

  return L.divIcon({
    className: 'transport-marker',
    html: `<span class="transport-marker__icon ${selectedClass}" style="--marker-color:${meta.color}">
        ${iconSvg}
      </span>`,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
    tooltipAnchor: [0, -anchor],
  })
}

const renderMarkers = () => {
  if (!markerLayer) {
    return
  }

  markerLayer.clearLayers()
  markers.clear()

  store.stops.forEach((stop) => {
    const isSelected = store.selectedStop?.node === stop.node
    const marker = L.marker([stop.lat, stop.lon], {
      icon: createMarkerIcon(stop, isSelected),
    })
    marker.bindTooltip(stop.displayName, { sticky: true })
    marker.on('click', () => store.selectStop(stop))
    markerLayer.addLayer(marker)
    markers.set(stop.node, { marker, stop })
  })
}

const highlightSelectedStop = () => {
  markers.forEach(({ marker, stop }) => {
    const isSelected = store.selectedStop && stop.node === store.selectedStop.node
    marker.setIcon(createMarkerIcon(stop, isSelected))
  })

  if (markerLayer) {
    markerLayer.refreshClusters()
  }
}

const focusSelectedStop = () => {
  if (!mapInstance || !store.selectedStop) {
    return
  }

  mapInstance.setView([store.selectedStop.lat, store.selectedStop.lon], 16, {
    animate: true,
  })
}

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

const findNearestStop = () => {
  if (!navigator.geolocation) {
    locationError.value = t('geolocation.notSupported')
    return
  }

  locatingUser.value = true
  locationError.value = null

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const userLat = position.coords.latitude
      const userLon = position.coords.longitude

      // Remove existing user marker if any
      if (userMarker && mapInstance) {
        mapInstance.removeLayer(userMarker)
      }

      // Add user location marker
      if (mapInstance) {
        userMarker = L.marker([userLat, userLon], {
          icon: L.divIcon({
            className: 'user-location-marker',
            html: '<span class="user-location-marker__dot"></span>',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        })
        userMarker.bindTooltip(t('stopMap.yourLocation'), { sticky: true })
        userMarker.addTo(mapInstance)
      }

      // Find nearest stop
      let nearestStop = null
      let minDistance = Infinity

      store.stops.forEach((stop) => {
        const distance = calculateDistance(userLat, userLon, stop.lat, stop.lon)
        if (distance < minDistance) {
          minDistance = distance
          nearestStop = stop
        }
      })

      if (nearestStop) {
        store.selectStop(nearestStop)
        if (mapInstance) {
          mapInstance.setView([nearestStop.lat, nearestStop.lon], 16, {
            animate: true,
          })
        }
      }

      locatingUser.value = false
    },
    (error) => {
      locatingUser.value = false
      switch (error.code) {
        case error.PERMISSION_DENIED:
          locationError.value = t('geolocation.denied')
          break
        case error.POSITION_UNAVAILABLE:
          locationError.value = t('geolocation.unavailable')
          break
        case error.TIMEOUT:
          locationError.value = t('geolocation.timeout')
          break
        default:
          locationError.value = t('geolocation.genericError')
      }
      setTimeout(() => {
        locationError.value = null
      }, 5000)
    }
  )
}

onMounted(() => {
  const deferredInit = () => {
    initMap()
    // Highlight and focus the selected stop if one is already selected when component mounts
    if (store.selectedStop) {
      setTimeout(() => {
        highlightSelectedStop()
        focusSelectedStop()
      }, 100)
    }
  }

  // Use Intersection Observer to lazy load the map only when it's about to be visible
  // This prevents map tiles from blocking LCP
  if ('IntersectionObserver' in window && mapElement.value) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !mapInstance) {
            deferredInit()
            observer.disconnect()
          }
        })
      },
      {
        rootMargin: '100px', // Start loading 100px before the map is visible
      }
    )
    observer.observe(mapElement.value)
  } else {
    // Fallback: defer with requestIdleCallback
    if ('requestIdleCallback' in window) {
      requestIdleCallback(deferredInit, { timeout: 1500 })
    } else {
      setTimeout(deferredInit, 500)
    }
  }
})

onBeforeUnmount(() => {
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
  }
})

watch(
  () => store.stopCount,
  () => {
    renderMarkers()
    // Re-highlight after markers are rendered
    if (store.selectedStop) {
      setTimeout(() => {
        highlightSelectedStop()
      }, 50)
    }
  }
)

watch(
  () => store.selectedStop?.node,
  () => {
    highlightSelectedStop()
    focusSelectedStop()
  }
)

watch(
  () => themeStore.theme,
  () => {
    updateTileLayer()
  }
)
</script>

<template>
  <section v-show="!store.stopsLoading" class="panel map-panel">
    <header class="panel-header">
      <div>
        <h2>{{ t('stopMap.title') }}</h2>
      </div>
      <button
        @click="findNearestStop"
        :disabled="locatingUser"
        class="locate-button"
        :class="{ 'locate-button--loading': locatingUser }"
        :aria-label="t('stopMap.nearMe')"
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
        <span class="locate-button__text">{{ locatingUser ? t('stopMap.locating') : t('stopMap.nearMe') }}</span>
      </button>
    </header>
    <div v-if="locationError" class="location-error">{{ locationError }}</div>
    <div
      ref="mapElement"
      class="map-container"
      :class="{ 'map-container--loading': !mapInitialized }"
      :aria-label="t('stopMap.mapAriaLabel')"
    />
  </section>
</template>

