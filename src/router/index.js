import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import FullscreenBoardView from '../views/FullscreenBoardView.vue'
import VehicleTracker from '../components/VehicleTracker.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/stops/:node',
      name: 'stop',
      component: HomeView,
      props: true,
    },
    {
      path: '/stops/:node/track/:tripId',
      name: 'track',
      component: VehicleTracker,
      props: true,
    },
    {
      path: '/stops/:node/fullscreen',
      name: 'fullscreen',
      component: FullscreenBoardView,
      props: true,
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'home' },
    },
  ],
})

export default router

