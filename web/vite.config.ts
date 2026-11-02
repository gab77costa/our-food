import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'OurFoodHub',
        short_name: 'OurFoodHub',
        description: 'Scadenze della dispensa di casa',
        lang: 'it',
        start_url: '/registra',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#ea580c',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // The Excel chunk is precached too, so files can be downloaded offline.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  server: { port: 3000, host: true },
  // Firebase SDK and exceljs are big; fine for a small private app.
  build: { chunkSizeWarningLimit: 1200 },
})
