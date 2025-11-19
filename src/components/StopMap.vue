<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet.markercluster'
import { useTimetableStore } from '../stores/timetableStore'
import { useThemeStore } from '../stores/themeStore'
import { getTransportMeta } from '../utils/transport'

const store = useTimetableStore()
const themeStore = useThemeStore()
const mapElement = ref(null)

let mapInstance
let markerLayer
let markers = new Map()
let currentTileLayer = null

const initMap = () => {
  if (mapInstance || !mapElement.value) {
    return
  }

  mapInstance = L.map(mapElement.value, {
    zoomControl: false,
  }).setView([50.0755, 14.4378], 12)

  updateTileLayer()

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

  // Add tile layer - use dark tiles if in dark mode
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  const attribution = isDark
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

  currentTileLayer = L.tileLayer(tileUrl, {
    attribution: attribution,
    maxZoom: 19,
  }).addTo(mapInstance)
}

const createMarkerIcon = (stop, isSelected = false) => {
  const meta = getTransportMeta(stop.transportKey || stop.trafficType)
  const selectedClass = isSelected ? 'transport-marker__dot--selected' : ''
  const size = isSelected ? 44 : 36
  const anchor = isSelected ? 22 : 18
  return L.divIcon({
    className: 'transport-marker',
    html: `<span class="transport-marker__dot ${selectedClass}" style="--marker-color:${meta.color}">
        ${meta.code}
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
  if (!store.selectedStop) {
    return
  }

  markers.forEach(({ marker, stop }) => {
    const isSelected = stop.node === store.selectedStop.node
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

onMounted(() => {
  initMap()
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
  <section class="panel map-panel">
    <header class="panel-header">
      <div>
        <h2>Or pick via map</h2>
      </div>
    </header>
    <div ref="mapElement" class="map-container" aria-label="Interactive map of PID stops" />
  </section>
</template>

