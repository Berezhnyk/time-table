<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useTimetableStore } from '../stores/timetableStore'
import StopSearch from '../components/StopSearch.vue'
import StopMap from '../components/StopMap.vue'
import DepartureBoard from '../components/DepartureBoard.vue'
import ThemeToggle from '../components/ThemeToggle.vue'
import LanguageSelector from '../components/LanguageSelector.vue'

const { t } = useI18n()
const store = useTimetableStore()
const route = useRoute()
const router = useRouter()
const syncingRoute = ref(false)

const goHome = () => {
  store.clearSelection()
  router.push({ name: 'home' })
}

const updatePageTitle = () => {
  if (store.selectedStop) {
    const stopName = store.selectedStop.altName || store.selectedStop.displayName
    document.title = `${stopName} - timetable.guide`
  } else {
    document.title = 'timetable.guide'
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

  if (match) {
    syncingRoute.value = true
    if (store.selectedStop?.node !== match.node) {
      // New stop selected, select it and fetch departures
      store.selectStop(match)
    } else {
      // Same stop, but refresh departures (e.g., when navigating back from tracking)
      store.fetchDepartures()
    }
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
        <p class="eyebrow">{{ t('header.eyebrow') }}</p>
        <h1 class="app-title" @click="goHome">{{ t('header.title') }}</h1>
        <p class="subtext">
          <i18n-t keypath="header.subtitle" tag="span">
            <template #link>
              <a
                class="link"
                href="https://pid.cz/en/opendata/"
                target="_blank"
                rel="noreferrer"
                >{{ t('header.publicDatasets') }}</a
              >
            </template>
          </i18n-t>
        </p>
      </div>
      <div style="display: flex; gap: 0.5rem; align-items: center;">
        <LanguageSelector />
        <ThemeToggle />
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
        {{ t('footer.madeBy') }}
        <a href="https://berezhnyk.com" target="_blank" rel="noopener noreferrer"
          >berezhnyk.com</a
        >
      </p>
    </footer>
  </div>
</template>
