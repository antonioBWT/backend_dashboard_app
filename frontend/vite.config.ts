import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Use Highcharts Stock build so navigator/scrollbar are available without
      // manual module loading (avoids UMD/ESM incompatibility with Vite)
      'highcharts': 'highcharts/highstock',
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
