<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTimetableStore } from '../stores/timetableStore'
import StopSearch from '../components/StopSearch.vue'
import StopMap from '../components/StopMap.vue'
import DepartureBoard from '../components/DepartureBoard.vue'

const store = useTimetableStore()
const route = useRoute()
const router = useRouter()
const syncingRoute = ref(false)

const updatePageTitle = () => {
  if (store.selectedStop) {
    const stopName = store.selectedStop.altName || store.selectedStop.displayName
    document.title = `${stopName} - Prague Departure Board`
  } else {
    document.title = 'Prague Departure Board'
  }
}

const selectFromRoute = () => {
  if (!store.stopCount) {
    return
  }

  const nodeParam = route.params.node

  if (!nodeParam) {
    store.clearSelection()
    return
  }

  const match = store.stops.find((stop) => String(stop.node) === String(nodeParam))

  if (match && store.selectedStop?.node !== match.node) {
    syncingRoute.value = true
    store.selectStop(match)
    Promise.resolve().then(() => {
      syncingRoute.value = false
    })
  }
}

onMounted(async () => {
  await store.fetchStops()
  selectFromRoute()
})

watch(
  () => [route.params.node, store.stopCount],
  () => {
    selectFromRoute()
  }
)

watch(
  () => store.selectedStop?.node,
  (node) => {
    if (syncingRoute.value) {
      return
    }

    const currentParam = route.params.node
    if (node && String(node) !== String(currentParam || '')) {
      router.replace({ name: 'stop', params: { node } })
    } else if (!node && currentParam) {
      router.replace({ name: 'home' })
    }

    updatePageTitle()
  }
)
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">PID Open Data</p>
        <h1>Prague Departure Board</h1>
        <p class="subtext">
          Search or pick any PID stop to see its live departures, powered by
          <a
            class="link"
            href="https://pid.cz/en/opendata/"
            target="_blank"
            rel="noreferrer"
            >public datasets</a
          >.
        </p>
      </div>
      <div class="header-meta">
        <p>Stops loaded: {{ store.stopCount || '—' }}</p>
      </div>
    </header>

    <main class="app-main">
      <section class="control-column">
        <StopSearch />
        <StopMap />
      </section>
      <section class="board-column">
        <DepartureBoard />
      </section>
    </main>

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

