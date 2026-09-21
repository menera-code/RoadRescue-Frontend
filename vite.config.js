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
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // -------------------------------------------------------------
        // FIX #1 — do NOT precache index.html.
        //
        // If index.html is precached and referenced by the SW's navigation
        // fallback, the browser serves a stale index.html after every
        // deploy. That stale HTML points at chunk hashes that no longer
        // exist on the server → 404 → SPA fallback returns HTML → the
        // browser refuses to execute HTML as a JS module → MIME error.
        //
        // By removing 'html' from globPatterns, the SW never caches
        // index.html at all. Every navigation fetches it fresh from the
        // network, so it always references the current build's chunks.
        // -------------------------------------------------------------
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],  // ← FIX: no 'html'

        // -------------------------------------------------------------
        // FIX #2 — disable the navigation fallback entirely.
        //
        // Even with html removed from precache, Workbox's default
        // navigateFallback would re-add index.html to the cache and
        // start serving it for navigations again. Setting this to null
        // tells Workbox: "never intercept navigations, let them hit
        // the network."
        // -------------------------------------------------------------
        navigateFallback: null,  // ← FIX (was '/index.html')

        // -------------------------------------------------------------
        // FIX #3 — activate new SW immediately + clean old caches.
        //
        // skipWaiting + clientsClaim mean the new SW takes over on the
        // very next page load after a deploy, without needing the user
        // to close every tab. cleanupOutdatedCaches deletes the old
        // precache bucket so we don't accumulate stale entries.
        // -------------------------------------------------------------
        skipWaiting: true,             // ← FIX
        clientsClaim: true,            // ← FIX
        cleanupOutdatedCaches: true,   // ← FIX

        // Don't waste cache space on source maps or the SW itself.
        globIgnores: [
          '**/sw.js',
          '**/workbox-*.js',
          '**/*.map',
        ],

        // Cache map tiles + Firebase media separately from the app shell.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'openfreemap-tiles',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/mt\d\.google\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-satellite-tiles',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 14, // 14 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'firebase-storage',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      // -------------------------------------------------------------
      // FIX #4 — disable the SW in dev.
      //
      // With enabled: true, the SW runs on localhost:5173 and caches
      // your dev bundle. When you edit a file, HMR breaks because the
      // SW serves the old version. This is why dev feels laggy and why
      // you sometimes see fixes "not take" locally.
      //
      // Turn it on only for a production-mode preview (npm run preview).
      // -------------------------------------------------------------
      devOptions: { enabled: false },  // ← FIX (was true)
    }),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          firebase: [
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/storage',
            'firebase/database',
          ],
          charts: ['vue3-apexcharts', 'apexcharts'],
        },
      },
    },
  },
})