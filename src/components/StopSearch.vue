<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { refDebounced } from '@vueuse/core'
import { useTimetableStore } from '../stores/timetableStore'
import { getTransportMeta } from '../utils/transport'

const store = useTimetableStore()
const router = useRouter()
const query = ref('')
const debouncedQuery = refDebounced(query, 250)

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
      return {
        stop: groupStop,
        transportMeta: getTransportMeta(groupStop.transportKey || groupStop.trafficType),
        linesSummary: uniqueLines.length ? uniqueLines.slice(0, 6).join(' · ') : 'Lines TBD',
      }
    })
})

const selectGroup = (group) => {
  store.selectStop(group.stop)
  router.replace({ name: 'home', params: { node: group.stop.node } })

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
</script>

<template>
  <section class="panel">
    <header class="panel-header">
      <div>
        <p class="eyebrow">Step 1</p>
        <h2>Select a stop</h2>
      </div>
      <span class="caption">
        {{ groupedStops.length }} groups
      </span>
    </header>

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
            <span
              class="transport-chip"
              :style="{ '--chip-color': group.transportMeta.color }"
              :aria-label="group.transportMeta.label"
            >
              {{ group.transportMeta.code }}
            </span>
          </div>
        </button>
      </li>
      <li v-if="!groupedStops.length" class="status-line">
        No stop groups match "{{ debouncedQuery }}".
      </li>
    </ul>
  </section>
</template>

