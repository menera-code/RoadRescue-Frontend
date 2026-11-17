import { ref, onBeforeUnmount } from 'vue'
import { getAdminAnalytics } from '@/services/adminAnalytics'

const REFRESH_INTERVAL = 60_000

export function useAnalytics(
  endpoint,
  paramsOrGetter = {},
  options = {}
) {
  const { autoRefresh = false } = options

  const data = ref(null)
  const loading = ref(true)
  const error = ref('')

  let timer = null
  let requestNumber = 0

  function resolveParams() {
    return typeof paramsOrGetter === 'function'
      ? paramsOrGetter()
      : paramsOrGetter
  }

  async function fetchOnce() {
    const currentRequest = ++requestNumber

    loading.value = true
    error.value = ''

    try {
      const params = resolveParams()

      const result = await getAdminAnalytics(
        endpoint,
        params
      )

      // Prevent an older request from overwriting newer data.
      if (currentRequest === requestNumber) {
        data.value = result
      }
    } catch (err) {
      console.error(
        `[useAnalytics] ${endpoint} failed:`,
        err
      )

      if (currentRequest === requestNumber) {
        error.value =
          err?.message ||
          `Unable to load ${endpoint} analytics.`
      }
    } finally {
      if (currentRequest === requestNumber) {
        loading.value = false
      }
    }
  }

  function startTimer() {
    if (!autoRefresh) return

    stopTimer()

    timer = setInterval(() => {
      fetchOnce()
    }, REFRESH_INTERVAL)
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  fetchOnce()
  startTimer()

  onBeforeUnmount(() => {
    stopTimer()
    requestNumber++
  })

  return {
    data,
    loading,
    error,
    refetch: fetchOnce,
  }
}

/**
 * Shared Admin Analytics Dashboard
 *
 * Uses the existing backend endpoints:
 * /analytics/summary
 * /analytics/timeline
 * /analytics/by-barangay
 * /analytics/qrt
 * /analytics/responders
 * /analytics/hourly
 */

export function useAnalyticsDashboard(
  paramsGetter = () => ({})
) {
  const summary = useAnalytics(
    'summary',
    paramsGetter,
    { autoRefresh: true }
  )

  const timeline = useAnalytics(
    'timeline',
    () => ({ days: 30 }),
    { autoRefresh: true }
  )

  const barangays = useAnalytics(
    'by-barangay',
    paramsGetter,
    { autoRefresh: true }
  )

  const qrt = useAnalytics(
    'qrt',
    paramsGetter,
    { autoRefresh: true }
  )

  const responders = useAnalytics(
    'responders',
    paramsGetter,
    { autoRefresh: true }
  )

  const hourly = useAnalytics(
    'hourly',
    () => ({ days: 30 }),
    { autoRefresh: true }
  )

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

  return {
    summary,
    timeline,
    barangays,
    qrt,
    responders,
    hourly,
    refetchAll,
  }
}
