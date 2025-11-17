<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import { useTimetableStore } from '../stores/timetableStore'
import { getTransportMeta } from '../utils/transport'

const store = useTimetableStore()
const mapElement = ref(null)

let mapInstance
let markerLayer

const initMap = () => {
  if (mapInstance || !mapElement.value) {
    return
  }

  mapInstance = L.map(mapElement.value, {
    zoomControl: false,
  }).setView([50.0755, 14.4378], 12)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(mapInstance)

  L.control
    .zoom({
      position: 'bottomright',
    })
    .addTo(mapInstance)

  markerLayer = L.layerGroup().addTo(mapInstance)
  setTimeout(() => mapInstance.invalidateSize(), 600)
  renderMarkers()
}

const createMarkerIcon = (stop) => {
  const meta = getTransportMeta(stop.transportKey || stop.trafficType)
  return L.divIcon({
    className: 'transport-marker',
    html: `<span class="transport-marker__dot" style="--marker-color:${meta.color}">
        ${meta.code}
      </span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    tooltipAnchor: [0, -18],
  })
}

const renderMarkers = () => {
  if (!markerLayer) {
    return
  }

  markerLayer.clearLayers()

  store.stops.forEach((stop) => {
    const marker = L.marker([stop.lat, stop.lon], {
      icon: createMarkerIcon(stop),
    })
    marker.bindTooltip(stop.displayName, { sticky: true })
    marker.on('click', () => store.selectStop(stop))
    markerLayer.addLayer(marker)
  })
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
  () => store.selectedStop?.id,
  () => {
    focusSelectedStop()
  }
)
</script>

<template>
  <section class="panel map-panel">
    <header class="panel-header">
      <div>
        <p class="eyebrow">Step 2</p>
        <h2>Or pick via map</h2>
      </div>
      <p class="caption">Tap a marker to load departures</p>
    </header>
    <div ref="mapElement" class="map-container" aria-label="Interactive map of PID stops" />
  </section>
</template>

