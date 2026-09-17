<script setup>
import { ref, computed, onMounted } from 'vue'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const windowDays = ref(90)
const temporal = ref(null)
const vehicles = ref(null)
const performance = ref(null)
const patterns = ref(null)
const predictions = ref(null)
const loading = ref(true)
const error = ref('')

async function fetchAll() {
  loading.value = true
  error.value = ''
  try {
    const [t, v, p, pat, pred] = await Promise.all([
      fetch(`${API_URL}/analytics/barangay-temporal?days=${windowDays.value}`).then((r) => r.json()),
      fetch(`${API_URL}/analytics/vehicles?days=${windowDays.value}`).then((r) => r.json()),
      fetch(`${API_URL}/analytics/ml-performance?days=${windowDays.value}`).then((r) => r.json()),
      fetch(`${API_URL}/analytics/patterns?days=${windowDays.value}`).then((r) => r.json()),
      fetch(`${API_URL}/analytics/predictions?days=${windowDays.value}`).then((r) => r.json()),
    ])
    temporal.value = t
    vehicles.value = v
    performance.value = p
    patterns.value = pat
    predictions.value = pred
  } catch (e) {
    console.error('[InsightsTab] fetch failed', e)
    error.value = 'Could not load operational insights.'
  } finally {
    loading.value = false
  }
}

onMounted(fetchAll)

function changeWindow(days) {
  windowDays.value = days
  fetchAll()
}

// ---------------------------------------------------------------------------
// RESPONSIVE HOOK — track viewport to adapt chart heights / density
// ---------------------------------------------------------------------------
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200)

if (typeof window !== 'undefined') {
  const onResize = () => (viewportWidth.value = window.innerWidth)
  window.addEventListener('resize', onResize, { passive: true })
  // no need to cleanup — this component lives for the app's lifetime
}

const isMobile = computed(() => viewportWidth.value < 640)
const isTablet = computed(() => viewportWidth.value >= 640 && viewportWidth.value < 1024)
const isDesktop = computed(() => viewportWidth.value >= 1024)

// Heatmap: fewer rows on mobile so cells stay legible
const heatmapRowCount = computed(() => {
  if (isMobile.value) return 6
  if (isTablet.value) return 10
  return 14
})

const heatmapHeight = computed(() => {
  if (isMobile.value) return 300
  if (isTablet.value) return 400
  return 480
})

const vehicleChartHeight = computed(() => {
  if (isMobile.value) return 260
  if (isTablet.value) return 320
  return 360
})

const dowChartHeight = computed(() => {
  if (isMobile.value) return 200
  if (isTablet.value) return 240
  return 260
})

// ---------------------------------------------------------------------------
// DERIVED — top barangay for the KPI strip
// ---------------------------------------------------------------------------
const topBarangay = computed(() => {
  const list = temporal.value?.barangays || []
  if (!list.length) return null
  return list[0]
})

// ---------------------------------------------------------------------------
// HEATMAP
// ---------------------------------------------------------------------------
const heatmapSeries = computed(() => {
  const list = temporal.value?.barangays || []
  return list.slice(0, heatmapRowCount.value).map((b) => ({
    name: b.barangay,
    data: b.hourly.map((v, h) => ({ x: `${h}:00`, y: v })),
  }))
})

const heatmapOptions = computed(() => ({
  chart: {
    type: 'heatmap',
    toolbar: { show: false },
    background: 'transparent',
    foreColor: '#93a3bd',
    fontFamily: 'inherit',
  },
  plotOptions: {
    heatmap: {
      shadeIntensity: 0.5,
      radius: isMobile.value ? 2 : 3,
      colorScale: {
        ranges: [
          { from: 0, to: 0, color: '#1a2337', name: 'No incidents' },
          { from: 1, to: 2, color: '#2f9e73', name: 'Low' },
          { from: 3, to: 5, color: '#f59e0b', name: 'Moderate' },
          { from: 6, to: 999, color: '#e63946', name: 'High' },
        ],
      },
    },
  },
  dataLabels: { enabled: false },
  xaxis: {
    labels: {
      style: { fontSize: isMobile.value ? '9px' : '10px' },
    },
  },
  yaxis: {
    labels: {
      style: { fontSize: isMobile.value ? '10px' : '11px' },
    },
  },
  tooltip: { theme: 'dark' },
}))

// ---------------------------------------------------------------------------
// VEHICLE BAR
// ---------------------------------------------------------------------------
const vehicleSeries = computed(() => {
  const list = vehicles.value?.top_vehicles || []
  // Fewer rows on mobile so bars stay wide & legible
  const limit = isMobile.value ? 6 : 10
  return [{ name: 'Incidents', data: list.slice(0, limit).map((v) => v.count) }]
})
const vehicleCategories = computed(() => {
  const list = vehicles.value?.top_vehicles || []
  const limit = isMobile.value ? 6 : 10
  return list.slice(0, limit).map((v) => capitalize(v.vehicle))
})
const vehicleOptions = computed(() => ({
  chart: {
    type: 'bar',
    toolbar: { show: false },
    background: 'transparent',
    foreColor: '#93a3bd',
    fontFamily: 'inherit',
  },
  plotOptions: {
    bar: {
      horizontal: true,
      borderRadius: 6,
      barHeight: isMobile.value ? '55%' : '65%',
    },
  },
  colors: ['#e63946'],
  xaxis: {
    categories: vehicleCategories.value,
    labels: { style: { fontSize: isMobile.value ? '10px' : '11px' } },
  },
  yaxis: {
    labels: { style: { fontSize: isMobile.value ? '10px' : '11px' } },
  },
  dataLabels: {
    enabled: true,
    style: {
      fontSize: isMobile.value ? '10px' : '11px',
      fontWeight: 700,
      colors: ['#fff'],
    },
    offsetX: isMobile.value ? 14 : 20,
  },
  grid: { borderColor: '#22304a', strokeDashArray: 3 },
  tooltip: { theme: 'dark' },
}))

// ---------------------------------------------------------------------------
// DAY OF WEEK
// ---------------------------------------------------------------------------
const dowSeries = computed(() => {
  const list = patterns.value?.day_of_week || []
  return [{ name: 'Incidents', data: list.map((d) => d.count) }]
})
const dowCategories = computed(() => {
  const list = patterns.value?.day_of_week || []
  // On mobile, use single-letter day labels to save space
  if (isMobile.value) {
    return list.map((d) => d.day.charAt(0))
  }
  return list.map((d) => d.day)
})
const dowOptions = computed(() => ({
  chart: {
    type: 'bar',
    toolbar: { show: false },
    background: 'transparent',
    foreColor: '#93a3bd',
    fontFamily: 'inherit',
  },
  colors: ['#3b82f6'],
  plotOptions: {
    bar: {
      borderRadius: 6,
      columnWidth: isMobile.value ? '70%' : '60%',
    },
  },
  xaxis: {
    categories: dowCategories.value,
    labels: { style: { fontSize: isMobile.value ? '10px' : '11px' } },
  },
  yaxis: { labels: { style: { fontSize: isMobile.value ? '10px' : '11px' } } },
  dataLabels: {
    enabled: true,
    style: {
      fontSize: isMobile.value ? '9px' : '11px',
      fontWeight: 700,
      colors: ['#fff'],
    },
  },
  grid: { borderColor: '#22304a', strokeDashArray: 3 },
  tooltip: { theme: 'dark' },
}))

// ---------------------------------------------------------------------------
// FORMATTERS
// ---------------------------------------------------------------------------
function capitalize(s) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatHour(h) {
  if (h == null) return '—'
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:00 ${ampm}`
}

const DAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday', 'Sunday',
]
function formatDay(d) {
  return DAY_NAMES[d] || '—'
}

function formatTypeLabel(t) {
  if (!t) return '—'
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
</script>

<template>
  <section class="insights-tab">
    <!-- ============================================================
         HEADER
         ============================================================ -->
    <header class="head">
      <div class="head-text">
        <h1 class="h1">Operational Insights</h1>
        <p class="muted">
          Aggregated, anonymized data to guide response planning,
          resource deployment, and road safety initiatives.
        </p>
      </div>
      <div class="window-chips">
        <button
          v-for="d in [30, 90, 180]"
          :key="d"
          type="button"
          class="window-chip"
          :class="{ 'window-chip--on': windowDays === d }"
          @click="changeWindow(d)"
        >
          {{ d }}d
        </button>
      </div>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="state-block">
      <div class="spinner" />
      <p class="tiny">Loading insights…</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="state-block state-block--error">
      <p class="tiny">{{ error }}</p>
      <button class="btn btn--soft" @click="fetchAll">Retry</button>
    </div>

    <template v-else>
      <!-- ============================================================
           KEY INDICATORS
           ============================================================ -->
      <div class="kpi-grid">
        <div class="kpi kpi--blue">
          <p class="kpi-label">Incidents</p>
          <p class="kpi-value">{{ performance?.total_analyzed || 0 }}</p>
          <p class="tiny kpi-note">last {{ windowDays }} days</p>
        </div>
        <div class="kpi kpi--green">
          <p class="kpi-label">Response rate</p>
          <p class="kpi-value">
            {{ Math.round((performance?.overall?.match_rate || 0) * 100) }}%
          </p>
          <p class="tiny kpi-note">confirmed</p>
        </div>
        <div class="kpi kpi--amber">
          <p class="kpi-label">With photos</p>
          <p class="kpi-value">
            {{ Math.round((vehicles?.yolo_coverage_rate || 0) * 100) }}%
          </p>
          <p class="tiny kpi-note">submission rate</p>
        </div>
        <div class="kpi kpi--purple">
          <p class="kpi-label">Busiest area</p>
          <p class="kpi-value kpi-value--small">
            {{ topBarangay?.barangay || '—' }}
          </p>
          <p class="tiny kpi-note">
            {{ topBarangay?.total || 0 }} incidents
          </p>
        </div>
      </div>

      <!-- ============================================================
           CHART GRID
           ============================================================ -->
      <div class="charts-grid">
        <!-- Heatmap — full width always -->
        <article class="chart-card chart-card--full">
          <div class="chart-head">
            <div class="chart-head-text">
              <h2 class="chart-title">Where and when incidents occur</h2>
              <p class="chart-caption">
                Rows show barangays, columns show hours of the day.
                Use this to align patrol schedules and responder shifts
                with actual demand.
              </p>
            </div>
            <span class="chart-tag">Deployment</span>
          </div>
          <div class="chart-body">
            <apexchart
              v-if="heatmapSeries.length"
              type="heatmap"
              :height="heatmapHeight"
              :options="heatmapOptions"
              :series="heatmapSeries"
            />
            <p v-else class="no-data">No incident records for this period.</p>
          </div>
        </article>

        <!-- Vehicle — half on desktop -->
        <article class="chart-card">
          <div class="chart-head">
            <div class="chart-head-text">
              <h2 class="chart-title">Vehicles involved</h2>
              <p class="chart-caption">
                Vehicle categories detected in reports. Use this to
                prioritise road safety campaigns and enforcement focus.
              </p>
            </div>
            <span class="chart-tag">Safety</span>
          </div>
          <div class="chart-body">
            <apexchart
              v-if="vehicleSeries[0]?.data?.length"
              type="bar"
              :height="vehicleChartHeight"
              :options="vehicleOptions"
              :series="vehicleSeries"
            />
            <p v-else class="no-data">No vehicle data for this period.</p>
          </div>
        </article>

        <!-- Day-of-week — half on desktop -->
        <article class="chart-card">
          <div class="chart-head">
            <div class="chart-head-text">
              <h2 class="chart-title">Weekly demand pattern</h2>
              <p class="chart-caption">
                Incident volume by day of the week. Helps identify
                recurring peaks that require additional staffing.
              </p>
            </div>
            <span class="chart-tag">Scheduling</span>
          </div>
          <div class="chart-body">
            <apexchart
              v-if="dowSeries[0]?.data?.length"
              type="bar"
              :height="dowChartHeight"
              :options="dowOptions"
              :series="dowSeries"
            />
            <p v-else class="no-data">No pattern data for this period.</p>
          </div>
        </article>

        <!-- Planning forecast — full width always -->
        <article class="chart-card chart-card--full">
          <div class="chart-head">
            <div class="chart-head-text">
              <h2 class="chart-title">Planning forecast</h2>
              <p class="chart-caption">
                Expected incident volume for the coming week, based on
                recent trends. Intended for shift scheduling and standby
                allocation — not as a prediction of individual incidents.
              </p>
            </div>
            <span class="chart-tag">Resource planning</span>
          </div>
          <div class="chart-body">
            <div class="prediction-grid">
              <div class="prediction-card">
                <p class="prediction-label">Expected next week</p>
                <p class="prediction-value">
                  {{ predictions?.predicted_next_week_total || 0 }}
                </p>
                <p class="tiny">incidents</p>
              </div>
              <div class="prediction-card">
                <p class="prediction-label">Weekly change</p>
                <p
                  class="prediction-value"
                  :class="{
                    'prediction-value--up': (predictions?.wow_growth_percent || 0) > 5,
                    'prediction-value--down': (predictions?.wow_growth_percent || 0) < -5,
                  }"
                >
                  {{
                    (predictions?.wow_growth_percent || 0) > 0 ? '+' : ''
                  }}{{ (predictions?.wow_growth_percent || 0).toFixed(1) }}%
                </p>
                <p class="tiny">vs. previous week</p>
              </div>
              <div class="prediction-card">
                <p class="prediction-label">Peak hours</p>
                <p class="prediction-value prediction-value--small">
                  {{
                    (predictions?.predicted_peak_hours || [])
                      .map((h) => formatHour(h))
                      .join(', ') || '—'
                  }}
                </p>
                <p class="tiny">highest expected volume</p>
              </div>
            </div>

            <div v-if="predictions?.barangay_forecasts?.length" class="forecast-table">
              <div class="forecast-row forecast-row--head">
                <span>Barangay</span>
                <span>Expected</span>
                <span>Trend</span>
              </div>
              <div
                v-for="b in predictions.barangay_forecasts.slice(0, isMobile ? 5 : 8)"
                :key="b.barangay"
                class="forecast-row"
              >
                <span class="forecast-name">{{ b.barangay }}</span>
                <span>{{ b.predicted_incidents }}</span>
                <span class="trend" :class="`trend--${b.trend}`">
                  {{
                    b.trend === 'up'
                      ? '↑ Up'
                      : b.trend === 'down'
                      ? '↓ Down'
                      : '→ Stable'
                  }}
                </span>
              </div>
            </div>
          </div>
        </article>

        <!-- Report reliability — full width -->
        <article
          v-if="performance?.per_type?.length"
          class="chart-card chart-card--full"
        >
          <div class="chart-head">
            <div class="chart-head-text">
              <h2 class="chart-title">Report reliability by category</h2>
              <p class="chart-caption">
                How often the reported incident category matches the
                platform's automated classification. Higher values indicate
                more consistent citizen reporting for that category.
              </p>
            </div>
            <span class="chart-tag">Data quality</span>
          </div>
          <div class="chart-body">
            <div class="accuracy-list">
              <div
                v-for="t in performance.per_type.slice(0, isMobile ? 6 : 10)"
                :key="t.type"
                class="accuracy-row"
              >
                <span class="accuracy-type">{{ formatTypeLabel(t.type) }}</span>
                <div class="accuracy-bar">
                  <div
                    class="accuracy-fill"
                    :style="{ width: `${Math.round(t.accuracy * 100)}%` }"
                  />
                </div>
                <span class="accuracy-percent">
                  {{ Math.round(t.accuracy * 100) }}%
                </span>
                <span class="accuracy-count tiny">{{ t.total }} reports</span>
              </div>
            </div>
          </div>
        </article>

        <!-- Area insights — full width -->
        <article
          v-if="temporal?.barangays?.length"
          class="chart-card chart-card--full"
        >
          <div class="chart-head">
            <div class="chart-head-text">
              <h2 class="chart-title">Barangay profile summary</h2>
              <p class="chart-caption">
                Most common incident category and busiest time for each
                of the top barangays. Use this to prepare barangay-specific
                response protocols.
              </p>
            </div>
            <span class="chart-tag">Area intelligence</span>
          </div>
          <div class="chart-body">
            <div class="insight-list">
              <div
                v-for="b in temporal.barangays.slice(0, isMobile ? 5 : 8)"
                :key="b.barangay"
                class="insight-row"
              >
                <div class="insight-main">
                  <span class="insight-name">{{ b.barangay }}</span>
                  <span class="insight-total">{{ b.total }} incidents</span>
                </div>
                <div class="insight-detail">
                  <span class="insight-pill">
                    Top:
                    <strong>{{ formatTypeLabel(b.top_type) }}</strong>
                    ({{ Math.round(b.top_type_share * 100) }}%)
                  </span>
                  <span class="insight-pill">
                    Peak hour:
                    <strong>{{ formatHour(b.peak_hour) }}</strong>
                  </span>
                  <span class="insight-pill">
                    Peak day:
                    <strong>{{ formatDay(b.peak_dow) }}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <!-- ============================================================
           PRIVACY & DATA USAGE NOTICE
           ============================================================ -->
      <aside class="privacy-notice">
        <div class="privacy-icon" aria-hidden="true">🔒</div>
        <div class="privacy-body">
          <h3 class="privacy-title">Data usage & privacy</h3>
          <p class="privacy-text">
            All analytics on this page use <strong>aggregated,
            anonymized incident data</strong>. No individual citizen
            information (names, contact details, or precise home
            locations) is displayed. This data supports operational
            planning, resource allocation, and response quality
            improvement only.
          </p>
          <p class="privacy-text">
            Processing is conducted in accordance with
            <strong>Republic Act No. 10173</strong> (Data Privacy Act of
            2012). Access is restricted to authorized administrators.
          </p>
        </div>
      </aside>
    </template>
  </section>
</template>

<style scoped>
.insights-tab {
  display: flex;
  flex-direction: column;
  padding-bottom: 20px;
}

/* ============================================================
   HEADER — stacks on mobile, side-by-side on desktop
   ============================================================ */
.head {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 20px;
}

.head-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.head .h1 {
  font-size: 1.35rem;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.head .muted {
  line-height: 1.55;
  font-size: 0.875rem;
  max-width: 65ch;
}

.window-chips {
  display: inline-flex;
  gap: 4px;
  background: var(--bg-input);
  padding: 3px;
  border-radius: 10px;
  align-self: flex-start;
  flex-shrink: 0;
}

.window-chip {
  padding: 6px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.window-chip--on {
  background: #3b82f6;
  color: #fff;
}

.window-chip:active:not(.window-chip--on) {
  transform: scale(0.96);
}

@media (min-width: 640px) {
  .head {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }
  .head .h1 {
    font-size: 1.5rem;
  }
  .head .muted {
    font-size: 0.9375rem;
  }
}

@media (min-width: 1024px) {
  .head {
    margin-bottom: 26px;
  }
  .head .h1 {
    font-size: 1.75rem;
  }
  .head .muted {
    font-size: 1rem;
  }
}

/* ============================================================
   STATES
   ============================================================ */
.state-block {
  background: var(--bg-elev);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  padding: 40px 24px;
  text-align: center;
}

.state-block--error {
  border-color: rgba(239, 68, 68, 0.3);
}

.spinner {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: #3b82f6;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.no-data {
  text-align: center;
  padding: 40px 12px;
  color: var(--text-muted);
  font-size: 0.875rem;
}

/* ============================================================
   KPI GRID — 2 cols mobile, 4 cols tablet+
   ============================================================ */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 20px;
}

.kpi {
  padding: 14px 14px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  min-width: 0;
}

.kpi--green {
  border-color: rgba(47, 158, 115, 0.3);
  background:
    radial-gradient(90% 100% at 0% 0%, rgba(47, 158, 115, 0.10) 0%, transparent 70%),
    var(--bg-elev);
}

.kpi--blue {
  border-color: rgba(59, 130, 246, 0.3);
  background:
    radial-gradient(90% 100% at 0% 0%, rgba(59, 130, 246, 0.10) 0%, transparent 70%),
    var(--bg-elev);
}

.kpi--amber {
  border-color: rgba(245, 158, 11, 0.3);
  background:
    radial-gradient(90% 100% at 0% 0%, rgba(245, 158, 11, 0.10) 0%, transparent 70%),
    var(--bg-elev);
}

.kpi--purple {
  border-color: rgba(139, 92, 246, 0.3);
  background:
    radial-gradient(90% 100% at 0% 0%, rgba(139, 92, 246, 0.10) 0%, transparent 70%),
    var(--bg-elev);
}

.kpi-label {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kpi-value {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text);
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin-bottom: 4px;
  word-break: break-word;
}

.kpi-value--small {
  font-size: 1rem;
  line-height: 1.3;
  word-break: break-word;
}

.kpi-note {
  line-height: 1.3;
  font-size: 0.6875rem;
}

@media (min-width: 640px) {
  .kpi {
    padding: 16px 18px;
  }
  .kpi-label {
    font-size: 0.6875rem;
    margin-bottom: 8px;
  }
  .kpi-value {
    font-size: 1.625rem;
  }
  .kpi-value--small {
    font-size: 1.125rem;
  }
  .kpi-note {
    font-size: 0.75rem;
  }
}

@media (min-width: 768px) {
  .kpi-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 24px;
  }
  .kpi {
    padding: 18px 20px;
  }
  .kpi-value {
    font-size: 1.875rem;
  }
  .kpi-value--small {
    font-size: 1.25rem;
  }
}

@media (min-width: 1024px) {
  .kpi-value {
    font-size: 2rem;
  }
  .kpi {
    padding: 20px 22px;
  }
}

/* ============================================================
   CHART GRID — 1 col mobile, 2 col tablet+
   ============================================================ */
.charts-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
  margin-bottom: 16px;
}

.chart-card {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 14px 14px;
  min-width: 0;
}

.chart-card--full {
  grid-column: 1 / -1;
}

.chart-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border);
}

.chart-head-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.chart-title {
  font-size: 0.9375rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.3;
}

.chart-caption {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.5;
  max-width: 70ch;
}

.chart-tag {
  align-self: flex-start;
  font-size: 0.5625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
  padding: 4px 9px;
  border-radius: 99px;
  white-space: nowrap;
}

.chart-body {
  min-height: 200px;
  min-width: 0;
}

@media (min-width: 640px) {
  .chart-head {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .chart-title {
    font-size: 1rem;
  }
  .chart-caption {
    font-size: 0.8125rem;
  }
}

@media (min-width: 768px) {
  .charts-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .chart-card {
    padding: 18px 16px 14px;
  }
}

@media (min-width: 1024px) {
  .charts-grid {
    gap: 18px;
    margin-bottom: 20px;
  }
  .chart-card {
    padding: 22px 22px 18px;
    border-radius: var(--radius-lg);
  }
  .chart-title {
    font-size: 1.0625rem;
  }
  .chart-caption {
    font-size: 0.875rem;
  }
}

/* ============================================================
   PREDICTION CARDS
   ============================================================ */
.prediction-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-bottom: 18px;
}

.prediction-card {
  padding: 14px 12px;
  background: var(--bg-input);
  border-radius: var(--radius);
  text-align: center;
  min-width: 0;
}

.prediction-label {
  font-size: 0.625rem;
  text-transform: uppercase;
  color: var(--text-muted);
  font-weight: 700;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prediction-value {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text);
  margin-bottom: 6px;
  line-height: 1.1;
  word-break: break-word;
}

.prediction-value--small {
  font-size: 0.9375rem;
}

.prediction-value--up {
  color: #e63946;
}

.prediction-value--down {
  color: #2f9e73;
}

@media (min-width: 480px) {
  .prediction-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 768px) {
  .prediction-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  .prediction-card {
    padding: 18px 16px;
  }
  .prediction-label {
    font-size: 0.6875rem;
    margin-bottom: 8px;
  }
  .prediction-value {
    font-size: 1.75rem;
  }
  .prediction-value--small {
    font-size: 1rem;
  }
}

/* ============================================================
   FORECAST TABLE
   ============================================================ */
.forecast-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.forecast-row {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-input);
  border-radius: 8px;
  font-size: 0.75rem;
  align-items: center;
}

.forecast-row--head {
  background: transparent;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  font-size: 0.625rem;
  letter-spacing: 0.06em;
  padding: 4px 12px 8px;
}

.forecast-name {
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trend {
  font-weight: 700;
  font-size: 0.6875rem;
  text-align: right;
  white-space: nowrap;
}

.trend--up {
  color: #e63946;
}

.trend--down {
  color: #2f9e73;
}

.trend--stable {
  color: var(--text-muted);
}

@media (min-width: 640px) {
  .forecast-row {
    font-size: 0.8125rem;
    padding: 10px 14px;
    gap: 12px;
  }
  .trend {
    font-size: 0.75rem;
  }
}

/* ============================================================
   ACCURACY LIST
   ============================================================ */
.accuracy-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.accuracy-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 2fr) 40px;
  gap: 10px;
  align-items: center;
  font-size: 0.75rem;
}

.accuracy-type {
  color: var(--text);
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.accuracy-bar {
  height: 8px;
  background: var(--bg-input);
  border-radius: 99px;
  overflow: hidden;
}

.accuracy-fill {
  height: 100%;
  background: linear-gradient(90deg, #2f9e73, #3cb886);
  border-radius: 99px;
  transition: width 0.4s ease;
}

.accuracy-percent {
  text-align: right;
  font-weight: 700;
  color: var(--text);
  font-size: 0.75rem;
}

.accuracy-count {
  display: none;
  text-align: right;
}

@media (min-width: 640px) {
  .accuracy-row {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 2.5fr) 50px 80px;
    gap: 14px;
    font-size: 0.8125rem;
  }
  .accuracy-count {
    display: block;
  }
}

@media (min-width: 1024px) {
  .accuracy-row {
    grid-template-columns: 180px minmax(0, 1fr) 60px 100px;
    gap: 16px;
    font-size: 0.875rem;
  }
}

/* ============================================================
   INSIGHT LIST
   ============================================================ */
.insight-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.insight-row {
  padding: 12px 14px;
  background: var(--bg-input);
  border-radius: 10px;
}

.insight-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.insight-name {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.insight-total {
  font-size: 0.6875rem;
  color: var(--text-muted);
  flex-shrink: 0;
  white-space: nowrap;
}

.insight-detail {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.insight-pill {
  font-size: 0.625rem;
  font-weight: 500;
  padding: 4px 9px;
  border-radius: 6px;
  background: var(--bg-elev);
  color: var(--text-muted);
  white-space: nowrap;
}

.insight-pill strong {
  color: var(--text);
  font-weight: 700;
}

@media (min-width: 640px) {
  .insight-name {
    font-size: 0.9375rem;
  }
  .insight-total {
    font-size: 0.75rem;
  }
  .insight-pill {
    font-size: 0.6875rem;
    padding: 4px 10px;
  }
  .insight-row {
    padding: 14px 16px;
  }
}

/* ============================================================
   PRIVACY NOTICE
   ============================================================ */
.privacy-notice {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(59, 130, 246, 0.06);
  border: 1px solid rgba(59, 130, 246, 0.22);
  border-radius: var(--radius);
  margin-top: 8px;
}

.privacy-icon {
  font-size: 1.125rem;
  line-height: 1.2;
  flex-shrink: 0;
}

.privacy-body {
  min-width: 0;
  flex: 1;
}

.privacy-title {
  font-size: 0.8125rem;
  font-weight: 700;
  color: #3b82f6;
  margin-bottom: 6px;
}

.privacy-text {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.55;
  margin-bottom: 8px;
}

.privacy-text:last-child {
  margin-bottom: 0;
}

.privacy-text strong {
  color: var(--text);
  font-weight: 650;
}

@media (min-width: 640px) {
  .privacy-notice {
    padding: 16px 20px;
    gap: 14px;
  }
  .privacy-icon {
    font-size: 1.25rem;
  }
  .privacy-title {
    font-size: 0.875rem;
  }
  .privacy-text {
    font-size: 0.8125rem;
    line-height: 1.6;
  }
}

@media (min-width: 1024px) {
  .privacy-notice {
    padding: 18px 22px;
  }
}

/* ============================================================
   VERY SMALL PHONES (<=360px)
   ============================================================ */
@media (max-width: 360px) {
  .head .h1 {
    font-size: 1.2rem;
  }
  .kpi-value {
    font-size: 1.25rem;
  }
  .kpi-value--small {
    font-size: 0.875rem;
  }
  .prediction-value {
    font-size: 1.25rem;
  }
  .window-chip {
    padding: 5px 9px;
    font-size: 0.6875rem;
  }
  .chart-title {
    font-size: 0.875rem;
  }
  .chart-caption {
    font-size: 0.6875rem;
  }
}
</style>