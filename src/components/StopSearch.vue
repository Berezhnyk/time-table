<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { refDebounced } from '@vueuse/core'
import { useTimetableStore } from '../stores/timetableStore'
import { getTransportMeta, getTransportIconSvg, getUniqueTransportTypes } from '../utils/transport'

const store = useTimetableStore()
const router = useRouter()
const query = ref('')
const debouncedQuery = refDebounced(query, 250)
const locatingUser = ref(false)
const locationError = ref(null)

// Clear search when selection is cleared
watch(
  () => store.selectedStop,
  (newStop) => {
    if (!newStop) {
      query.value = ''
    }
  }
)

const normalize = (text) => {
  if (!text) return ''
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

const matchesQuery = (stop, needle) => {
  if (!needle) return true
  const normalizedNeedle = normalize(needle)
  return (
    normalize(stop.displayName).includes(normalizedNeedle) ||
    normalize(stop.altName).includes(normalizedNeedle) ||
    normalize(stop.groupName).includes(normalizedNeedle) ||
    normalize(stop.municipality).includes(normalizedNeedle)
  )
}

const groupedStops = computed(() => {
  const text = debouncedQuery.value.trim()
  return store.stops
    .filter((groupStop) => matchesQuery(groupStop, text))
    .slice(0, 12)
    .map((groupStop) => {
      const lines = groupStop.lines.map((line) => line.name || line.id).filter(Boolean)
      const uniqueLines = [...new Set(lines)]
      const transportTypes = getUniqueTransportTypes(groupStop.lines)

      // Create icons for each transport type
      const transportIcons = transportTypes.map(type => {
        // For metro, try to find a line name to get correct color
        let lineName = null
        if (type.toLowerCase() === 'metro') {
          const metroLine = groupStop.lines.find(line =>
            line.type && line.type.toLowerCase() === 'metro'
          )
          lineName = metroLine ? metroLine.name : null
        }

        const meta = getTransportMeta(type, lineName)
        return {
          svg: getTransportIconSvg(meta.label, 16),
          color: meta.color,
          label: meta.label
        }
      })

      // Fallback to main transport type if no lines
      if (transportIcons.length === 0) {
        const transportMeta = getTransportMeta(groupStop.transportKey || groupStop.trafficType)
        transportIcons.push({
          svg: getTransportIconSvg(transportMeta.label, 16),
          color: transportMeta.color,
          label: transportMeta.label
        })
      }

      return {
        stop: groupStop,
        transportIcons,
        linesSummary: uniqueLines.length ? uniqueLines.slice(0, 6).join(' · ') : 'Lines TBD',
      }
    })
})

const selectGroup = (group) => {
  store.selectStop(group.stop)
  router.replace({ name: 'stop', params: { node: group.stop.node } })

  // Scroll to departure board on mobile
  if (window.innerWidth <= 1100) {
    setTimeout(() => {
      const boardPanel = document.querySelector('.board-panel')
      if (boardPanel) {
        boardPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)
  }
}

const clearSearch = () => {
  query.value = ''
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
    locationError.value = 'Geolocation is not supported by your browser'
    setTimeout(() => {
      locationError.value = null
    }, 5000)
    return
  }

  locatingUser.value = true
  locationError.value = null

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const userLat = position.coords.latitude
      const userLon = position.coords.longitude

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
        router.replace({ name: 'stop', params: { node: nearestStop.node } })

        // Scroll to departure board on mobile
        if (window.innerWidth <= 1100) {
          setTimeout(() => {
            const boardPanel = document.querySelector('.board-panel')
            if (boardPanel) {
              boardPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          }, 100)
        }
      }

      locatingUser.value = false
    },
    (error) => {
      locatingUser.value = false
      switch (error.code) {
        case error.PERMISSION_DENIED:
          locationError.value = 'Location access denied. Please enable location permissions.'
          break
        case error.POSITION_UNAVAILABLE:
          locationError.value = 'Location information unavailable.'
          break
        case error.TIMEOUT:
          locationError.value = 'Location request timed out.'
          break
        default:
          locationError.value = 'An error occurred while getting your location.'
      }
      setTimeout(() => {
        locationError.value = null
      }, 5000)
    }
  )
}
</script>

<template>
  <section class="panel">
    <header class="panel-header">
      <div>
        <h2>Select a stop</h2>
      </div>
      <button
        @click="findNearestStop"
        :disabled="locatingUser"
        class="locate-button"
        :class="{ 'locate-button--loading': locatingUser }"
        aria-label="Find nearest stop"
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
        <span class="locate-button__text">{{ locatingUser ? 'Locating...' : 'Near Me' }}</span>
      </button>
    </header>

    <div v-if="locationError" class="location-error">{{ locationError }}</div>

    <label class="input-label" for="stop-search-input">Search by name</label>
    <div class="input-row">
      <input
        id="stop-search-input"
        v-model="query"
        type="search"
        placeholder="Type e.g. Anděl, Muzeum, Karlovo náměstí…"
        autocomplete="off"
      />
      <button
        v-if="query"
        class="ghost"
        type="button"
        aria-label="Clear search"
        @click="clearSearch"
      >
        Clear
      </button>
    </div>

    <p v-if="store.stopsLoading" class="status-line">
      Loading official PID stop list…
    </p>
    <p v-else-if="store.stopsError" class="status-line error">
      {{ store.stopsError }}
    </p>

    <ul v-else class="group-list">
      <li v-for="group in groupedStops" :key="group.node" class="group-item">
        <button
          type="button"
          class="group-button"
          :class="{ active: store.selectedStop?.node === group.node }"
          @click="selectGroup(group)"
        >
          <div class="group-header">
            <div>
              <p class="group-name">{{ group.stop.groupName }}</p>
              <p class="group-meta">
                {{ group.stop.municipality || 'Unknown municipality' }}
                <span v-if="group.stop.zone"> · Zone {{ group.stop.zone }}</span>
              </p>
              <p class="stop-lines">
                {{ group.linesSummary }}
              </p>
            </div>
            <div class="transport-icons-group">
              <span
                v-for="(icon, idx) in group.transportIcons"
                :key="idx"
                class="transport-icon transport-icon--small"
                :style="{ '--icon-bg-color': icon.color }"
                :aria-label="icon.label"
                v-html="icon.svg"
              >
              </span>
            </div>
          </div>
        </button>
      </li>
      <li v-if="!groupedStops.length" class="status-line">
        No stop groups match "{{ debouncedQuery }}".
      </li>
    </ul>
  </section>
</template>

