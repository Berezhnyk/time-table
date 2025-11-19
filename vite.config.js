import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
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
