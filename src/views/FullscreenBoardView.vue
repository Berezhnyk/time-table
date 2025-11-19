<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTimetableStore } from '../stores/timetableStore'
import DepartureBoard from '../components/DepartureBoard.vue'
import ThemeToggle from '../components/ThemeToggle.vue'

const REFRESH_INTERVAL = 5000

const store = useTimetableStore()
const route = useRoute()
const router = useRouter()
const syncing = ref(false)
const refreshTimer = ref(null)

const updatePageTitle = () => {
  if (store.selectedStop) {
    const stopName = store.selectedStop.altName || store.selectedStop.displayName
    document.title = `${stopName} (Fullscreen) - timetable.guide`
  } else {
    document.title = 'timetable.guide'
  }
}

const ensureStops = async () => {
  if (!store.stopCount) {
    await store.fetchStops()
  }
}

const selectFromRoute = () => {
  const nodeParam = route.params.node

  if (!nodeParam) {
    store.clearSelection()
    return
  }

  const match = store.stops.find((stop) => String(stop.node) === String(nodeParam))

  if (match && store.selectedStop?.node !== match.node) {
    syncing.value = true
    store.selectStop(match)
    Promise.resolve().then(() => {
      syncing.value = false
    })
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

const exitFullscreen = () => {
  const target = store.selectedStop?.node
    ? { name: 'home', params: { node: store.selectedStop.node } }
    : { name: 'home' }
  router.push(target)
}

onMounted(async () => {
  await ensureStops()
  selectFromRoute()
  if (store.hasSelection) {
    store.fetchDepartures()
  }
  startAutoRefresh()
})

onBeforeUnmount(() => {
  stopAutoRefresh()
})

watch(
  () => [route.params.node, store.stopCount],
  () => {
    if (!store.stopCount) {
      return
    }
    selectFromRoute()
  }
)

watch(
  () => store.selectedStop?.node,
  (node) => {
    if (syncing.value) {
      return
    }

    const currentParam = route.params.node
    if (node && String(node) !== String(currentParam || '')) {
      router.replace({ name: 'fullscreen', params: { node } })
    } else if (!node && currentParam) {
      router.replace({ name: 'fullscreen' })
    }

    if (node) {
      store.fetchDepartures()
    }

    updatePageTitle()
  }
)
</script>

<template>
  <div class="fullscreen-shell">
    <header class="fullscreen-header">
      <div>
        <p class="eyebrow">Fullscreen mode</p>
        <h1>
          {{
            store.selectedStop
              ? store.selectedStop.altName || store.selectedStop.displayName
              : 'Select a stop to continue'
          }}
        </h1>
        <p v-if="store.selectedStop" class="subtext">
          Node {{ store.selectedStop.node }}
          <span v-if="store.selectedStop.municipality">
            · {{ store.selectedStop.municipality }}
          </span>
        </p>
      </div>
      <div style="display: flex; gap: 0.5rem;">
        <ThemeToggle />
        <button class="ghost" type="button" @click="exitFullscreen">
          Exit fullscreen
        </button>
      </div>
    </header>

    <section class="fullscreen-board">
      <DepartureBoard :key="store.lastUpdated" />
    </section>

    <footer class="app-footer">
      <p>
        Made by
        <a href="https://berezhnyk.com" target="_blank" rel="noopener noreferrer"
          >berezhnyk.com</a
        >
      </p>
    </footer>
  </div>
</template>
