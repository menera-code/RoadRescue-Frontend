import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VueApexCharts from 'vue3-apexcharts'   // ← ADD THIS
import App from './App.vue'
import router from './router'
import { registerSW } from 'virtual:pwa-register'
import './assets/styles/main.css'

registerSW({ immediate: true })

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(VueApexCharts)                        // ← ADD THIS
app.mount('#app')