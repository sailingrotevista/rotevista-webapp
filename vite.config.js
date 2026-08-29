import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        /* Configurazione Cache Mappe con limiti di memoria controllati */
        runtimeCaching: [
          {
            /* Cache Mappe Satellitari e Vettoriali ESRI (Home + AIS) */
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'esri-map-tiles-cache',
              expiration: {
                maxEntries: 1200, // Max ~25 MB totali
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 Giorni di validità
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            /* Cache Segnalamenti Nautici OpenSeaMap (Boe, Fari) */
            urlPattern: /^https:\/\/tiles\.openseamap\.org\/seamark\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'openseamap-tiles-cache',
              expiration: {
                maxEntries: 600, // Max ~12 MB totali
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 Giorni di validità
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  base: './',
  build: {
    outDir: 'public', // Output diretto dentro public per Signal K
    emptyOutDir: false, // CRUCIALE: impedisce a Vite di cancellare AppIcon.png dentro public/
  }
})
