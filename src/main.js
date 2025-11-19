import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { inject } from '@vercel/analytics'
import App from './App.vue'
import router from './router'
import './style.css'

inject()

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.mount('#app')
