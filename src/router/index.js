import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import FullscreenBoardView from '../views/FullscreenBoardView.vue'
import VehicleTracker from '../components/VehicleTracker.vue'

// Helper function to update meta tags
function updateMetaTags(title, description, url) {
  // Update title
  document.title = title

  // Update meta description
  const metaDescription = document.querySelector('meta[name="description"]')
  if (metaDescription) {
    metaDescription.setAttribute('content', description)
  }

  // Update Open Graph tags
  const ogTitle = document.querySelector('meta[property="og:title"]')
  if (ogTitle) {
    ogTitle.setAttribute('content', title)
  }

  const ogDescription = document.querySelector('meta[property="og:description"]')
  if (ogDescription) {
    ogDescription.setAttribute('content', description)
  }

  const ogUrl = document.querySelector('meta[property="og:url"]')
  if (ogUrl) {
    ogUrl.setAttribute('content', url)
  }

  // Update Twitter tags
  const twitterTitle = document.querySelector('meta[name="twitter:title"]')
  if (twitterTitle) {
    twitterTitle.setAttribute('content', title)
  }

  const twitterDescription = document.querySelector('meta[name="twitter:description"]')
  if (twitterDescription) {
    twitterDescription.setAttribute('content', description)
  }

  const twitterUrl = document.querySelector('meta[name="twitter:url"]')
  if (twitterUrl) {
    twitterUrl.setAttribute('content', url)
  }

  // Update canonical URL
  let canonical = document.querySelector('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.appendChild(canonical)
  }
  canonical.setAttribute('href', url)
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: {
        title: 'Prague Public Transport Timetable | Real-Time Bus, Tram & Metro Departures',
        description: 'Live departure times for Prague buses, trams, and metro. Track vehicles in real-time, view schedules for all PID stops across Prague. Free, fast, and accurate public transport information.',
      },
    },
    {
      path: '/stops/:node',
      name: 'stop',
      component: HomeView,
      props: true,
      meta: {
        title: 'Stop Departures | Prague Public Transport',
        description: 'Real-time departure information for this Prague public transport stop. View live bus, tram, and metro schedules.',
      },
    },
    {
      path: '/stops/:node/track/:tripId',
      name: 'track',
      component: VehicleTracker,
      props: true,
      meta: {
        title: 'Track Vehicle | Prague Public Transport',
        description: 'Track this vehicle in real-time on the map. View current position, next stops, and arrival predictions.',
      },
    },
    {
      path: '/stops/:node/fullscreen',
      name: 'fullscreen',
      component: FullscreenBoardView,
      props: true,
      meta: {
        title: 'Departure Board | Prague Public Transport',
        description: 'Full-screen departure board showing real-time arrivals for this Prague transport stop.',
      },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'home' },
    },
  ],
})

// Update meta tags on route change
router.afterEach((to) => {
  const baseUrl = 'https://timetable.guide'
  const title = to.meta.title || 'Prague Public Transport Timetable | Real-Time Bus, Tram & Metro Departures'
  const description = to.meta.description || 'Live departure times for Prague buses, trams, and metro. Track vehicles in real-time, view schedules for all PID stops across Prague.'
  const url = baseUrl + to.fullPath

  updateMetaTags(title, description, url)
})

export default router

