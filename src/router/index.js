import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import FullscreenBoardView from '../views/FullscreenBoardView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/:node?',
      name: 'home',
      component: HomeView,
      props: true,
    },
    {
      path: '/fullscreen/:node?',
      name: 'fullscreen',
      component: FullscreenBoardView,
      props: true,
    },
  ],
})

export default router

