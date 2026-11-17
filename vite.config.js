
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'RoadRescue',
        short_name: 'RoadRescue',
        description: 'Roadside & emergency assistance, fast.',
        theme_color: '#0B1220',
        background_color: '#0B1220',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        importScripts: ['/push-handler.js'],
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        navigateFallback: null,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globIgnores: ['**/sw.js', '**/workbox-*.js', '**/*.map'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'openfreemap-tiles',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 2592000,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/mt\d\.google\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-satellite-tiles',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 1209600,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },

          // IMPORTANT:
          // Firebase Storage is deliberately NOT cached by the PWA.
          // Video playback needs proper HTTP Range requests.
          // Let Safari, Chrome, and the network handle these requests.
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
