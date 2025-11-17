import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: createProxyConfig(),
  preview: createProxyConfig(),
})

function createProxyConfig() {
  const proxyTargets = {
    '/pid-stops': {
      target: 'https://data.pid.cz',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/pid-stops/, ''),
    },
    '/golemio': {
      target: 'https://api.golemio.cz',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/golemio/, ''),
    },
  }

  return {
    proxy: proxyTargets,
  }
}
