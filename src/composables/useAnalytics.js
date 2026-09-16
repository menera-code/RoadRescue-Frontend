// src/composables/useAnalytics.js
import { ref, onBeforeUnmount } from 'vue'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const REFRESH_MS = 60_000

export function useAnalytics(endpoint, paramsOrGetter = {}, options = {}) {
  const { autoRefresh = false } = options

  const data = ref(null)
  const loading = ref(true)
  const error = ref('')
  let timer = null

  function resolveParams() {
    return typeof paramsOrGetter === 'function'
      ? paramsOrGetter()
      : paramsOrGetter
  }

  async function fetchOnce() {
    loading.value = true
    error.value = ''
    try {
      const params = resolveParams()
      const qs = new URLSearchParams(params).toString()
      const url = `${API_URL}/analytics/${endpoint}${qs ? `?${qs}` : ''}`
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      data.value = await resp.json()
    } catch (e) {
      console.error(`[useAnalytics] ${endpoint} failed`, e)
      error.value = 'Could not load analytics.'
    } finally {
      loading.value = false
    }
  }

  function startTimer() {
    if (!autoRefresh) return
    stopTimer()
    timer = setInterval(fetchOnce, REFRESH_MS)
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  fetchOnce()
  startTimer()
  onBeforeUnmount(stopTimer)

  return { data, loading, error, refetch: fetchOnce }
}

export function useAnalyticsDashboard(paramsGetter = () => ({})) {
  const summary    = useAnalytics('summary',     paramsGetter)
  const timeline   = useAnalytics('timeline',    () => ({ days: 30 }))
  const barangays  = useAnalytics('by-barangay', paramsGetter)
  const qrt        = useAnalytics('qrt',         paramsGetter)
  const responders = useAnalytics('responders',  paramsGetter)
  const hourly     = useAnalytics('hourly',      () => ({ days: 30 }))

  async function refetchAll() {
    await Promise.all([
      summary.refetch(),
      timeline.refetch(),
      barangays.refetch(),
      qrt.refetch(),
      responders.refetch(),
      hourly.refetch(),
    ])
  }

  return { summary, timeline, barangays, qrt, responders, hourly, refetchAll }
}