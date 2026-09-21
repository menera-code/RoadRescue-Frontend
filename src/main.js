import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VueApexCharts from 'vue3-apexcharts'
import App from './App.vue'
import router from './router'
import { registerSW } from 'virtual:pwa-register'
import './assets/styles/main.css'

// ---------------------------------------------------------------------------
// SERVICE WORKER
// ---------------------------------------------------------------------------
// `registerSW` from vite-plugin-pwa gives us an `updateSW` function.
// When the plugin detects a new build is available (because the SW's own
// script changed), `onNeedRefresh` fires. Calling `updateSW(true)` tells
// the new SW to skipWaiting + clientsClaim and immediately take over.
//
// This is what prevents the "stale index.html points at a deleted chunk"
// MIME error you were hitting — every deploy now forces the browser to
// fetch the fresh index.html on the next navigation.
// ---------------------------------------------------------------------------
const updateSW = registerSW({
  immediate: true,

  onNeedRefresh() {
    // A new version is on the server. Swap to it now instead of waiting
    // for the user to close every tab.
    updateSW(true)
  },

  onOfflineReady() {
    // Fires once the SW has precached everything for offline use.
    // Intentionally silent here — no toast, no console noise.
  },

  onRegisteredSW(swUrl, registration) {
    // Optional: poll for updates every 60s while the app is open so long
    // sessions pick up fresh deploys without needing a manual reload.
    if (!registration) return
    setInterval(() => {
      registration.update()
    }, 60 * 1000)
  },

  onRegisterError(error) {
    console.error('[PWA] service worker registration failed:', error)
  },
})

// ---------------------------------------------------------------------------
// APP
// ---------------------------------------------------------------------------
const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(VueApexCharts)
app.mount('#app')