<script setup>
import { computed, ref, watch } from 'vue'
import { useAnalyticsDashboard } from '@/composables/useAnalytics'

const windowDays = ref(30)
const dash = useAnalyticsDashboard(() => ({ days: windowDays.value }))
const refreshing = ref(false)

async function refresh() {
  refreshing.value = true
  try {
    await dash.refetchAll()
  } finally {
    refreshing.value = false
  }
}

// Refetch when window changes
watch(windowDays, () => dash.refetchAll())

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function formatSeconds(s) {
  if (s == null) return '—'
  if (s < 60) return `${Math.round(s)}s`
  return `${(s / 60).toFixed(1)}m`
}

const TYPE_LABELS = {
  flat_tire:       'Flat Tire',
  battery:         'Battery',
  fuel:            'Out of Fuel',
  stalled_vehicle: 'Stalled',
  minor_collision: 'Minor Crash',
  major_collision: 'Major Crash',
  vehicle_fire:    'Vehicle Fire',
  road_hazard:     'Road Hazard',
  other:           'Other',
}
function typeLabel(t) {
  return TYPE_LABELS[t] || t
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------
const kpis = computed(() => {
  const s = dash.summary.data.value
  const q = dash.qrt.data.value
  return {
    total: s?.total ?? 0,
    open: s?.open ?? 0,
    medianQrt: q?.median_seconds ?? null,
    ackRate: q?.acknowledgment_rate ?? 0,
  }
})

// ---------------------------------------------------------------------------
// CHART 1 — Timeline (Area) — full width
// ---------------------------------------------------------------------------
const timelineSeries = computed(() => {
  const days = dash.timeline.data.value?.days || []
  return [
    { name: 'Total',    data: days.map((d) => ({ x: d.date, y: d.total })) },
    { name: 'Open',     data: days.map((d) => ({ x: d.date, y: d.open })) },
    { name: 'Resolved', data: days.map((d) => ({ x: d.date, y: d.resolved })) },
  ]
})

const timelineOptions = {
  chart: {
    type: 'area',
    toolbar: { show: false },
    zoom: { enabled: false },
    foreColor: '#93a3bd',
    background: 'transparent',
    fontFamily: 'inherit',
  },
  colors: ['#3b82f6', '#f59e0b', '#2f9e73'],
  stroke: { curve: 'smooth', width: 2.5 },
  fill: {
    type: 'gradient',
    gradient: { opacityFrom: 0.35, opacityTo: 0.02 },
  },
  grid: {
    borderColor: '#22304a',
    strokeDashArray: 3,
    padding: { left: 4, right: 4, top: 0, bottom: 0 },
  },
  xaxis: {
    type: 'datetime',
    labels: { format: 'MMM dd', style: { fontSize: '11px' } },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: {
    labels: { style: { fontSize: '11px' } },
    min: 0,
  },
  legend: {
    position: 'top',
    horizontalAlign: 'right',
    fontSize: '12px',
    markers: { width: 9, height: 9, radius: 5 },
    itemMargin: { horizontal: 10 },
  },
  tooltip: { theme: 'dark' },
  dataLabels: { enabled: false },
}

// ---------------------------------------------------------------------------
// CHART 2 — Incident Types (Donut)
// ---------------------------------------------------------------------------
const typeSeries = computed(() => {
  const bt = dash.summary.data.value?.by_type || {}
  return Object.values(bt)
})
const typeLabels = computed(() => {
  const bt = dash.summary.data.value?.by_type || {}
  return Object.keys(bt).map(typeLabel)
})

const typeOptions = computed(() => ({
  chart: { type: 'donut', background: 'transparent', fontFamily: 'inherit' },
  labels: typeLabels.value,
  colors: ['#e63946', '#f59e0b', '#3b82f6', '#2f9e73', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b', '#94a3b8'],
  legend: {
    position: 'bottom',
    fontSize: '12px',
    markers: { width: 9, height: 9, radius: 5 },
    itemMargin: { horizontal: 8, vertical: 4 },
  },
  dataLabels: { enabled: false },
  stroke: { width: 2, colors: ['#121c2e'] },
  plotOptions: {
    pie: {
      donut: {
        size: '68%',
        labels: {
          show: true,
          name: { fontSize: '12px', color: '#93a3bd' },
          value: { fontSize: '22px', fontWeight: 700, color: '#eaf0fa' },
          total: {
            show: true,
            label: 'Total',
            fontSize: '12px',
            color: '#93a3bd',
            formatter: () => String(kpis.value.total),
          },
        },
      },
    },
  },
  tooltip: {
    theme: 'dark',
    y: { formatter: (v) => `${v} incidents` },
  },
}))

// ---------------------------------------------------------------------------
// CHART 3 — Status Distribution (Pie)
// ---------------------------------------------------------------------------
const statusSeries = computed(() => {
  const bs = dash.summary.data.value?.by_status || {}
  return Object.values(bs)
})
const statusLabels = computed(() => {
  const bs = dash.summary.data.value?.by_status || {}
  return Object.keys(bs).map((s) =>
    s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  )
})

const statusOptions = computed(() => ({
  chart: { type: 'pie', background: 'transparent', fontFamily: 'inherit' },
  labels: statusLabels.value,
  colors: ['#f59e0b', '#3b82f6', '#8b5cf6', '#2f9e73', '#64748b', '#e63946'],
  legend: {
    position: 'bottom',
    fontSize: '12px',
    markers: { width: 9, height: 9, radius: 5 },
  },
  dataLabels: {
    enabled: true,
    style: { fontSize: '11px', fontWeight: 600 },
    dropShadow: { enabled: false },
  },
  stroke: { width: 2, colors: ['#121c2e'] },
  tooltip: {
    theme: 'dark',
    y: { formatter: (v) => `${v} incidents` },
  },
}))

// ---------------------------------------------------------------------------
// CHART 4 — Severity (Radial Bar)
// ---------------------------------------------------------------------------
const severitySeries = computed(() => {
  const bs = dash.summary.data.value?.by_severity || {}
  const total = Object.values(bs).reduce((a, b) => a + b, 0)
  if (!total) return [0, 0, 0, 0]
  return [
    Math.round(((bs.low || 0) / total) * 100),
    Math.round(((bs.medium || 0) / total) * 100),
    Math.round(((bs.high || 0) / total) * 100),
    Math.round(((bs.critical || 0) / total) * 100),
  ]
})

const severityOptions = computed(() => ({
  chart: { type: 'radialBar', background: 'transparent', fontFamily: 'inherit' },
  labels: ['Low', 'Medium', 'High', 'Critical'],
  colors: ['#22c55e', '#f59e0b', '#ef4444', '#dc2626'],
  plotOptions: {
    radialBar: {
      hollow: { size: '40%', margin: 8 },
      track: {
        background: '#1a2337',
        strokeWidth: '100%',
        margin: 6,
      },
      dataLabels: {
        name: { fontSize: '12px', color: '#93a3bd' },
        value: { fontSize: '16px', fontWeight: 700, color: '#eaf0fa' },
        total: {
          show: true,
          label: 'Severity',
          fontSize: '12px',
          color: '#93a3bd',
          formatter: () => 'Breakdown',
        },
      },
    },
  },
  legend: {
    show: true,
    position: 'bottom',
    fontSize: '12px',
    markers: { width: 9, height: 9, radius: 5 },
  },
  stroke: { lineCap: 'round' },
  tooltip: {
    theme: 'dark',
    y: { formatter: (v) => `${v}%` },
  },
}))

// ---------------------------------------------------------------------------
// CHART 5 — Top Barangays (Horizontal Bar)
// ---------------------------------------------------------------------------
const barangaySeries = computed(() => {
  const list = dash.barangays.data.value?.barangays || []
  return [{ name: 'Incidents', data: list.slice(0, 8).map((b) => b.count) }]
})
const barangayCategories = computed(() => {
  const list = dash.barangays.data.value?.barangays || []
  return list.slice(0, 8).map((b) => b.barangay)
})

const barangayOptions = computed(() => ({
  chart: {
    type: 'bar',
    toolbar: { show: false },
    background: 'transparent',
    fontFamily: 'inherit',
  },
  plotOptions: {
    bar: { horizontal: true, borderRadius: 8, barHeight: '65%' },
  },
  colors: ['#3b82f6'],
  grid: { borderColor: '#22304a', strokeDashArray: 3 },
  xaxis: {
    categories: barangayCategories.value,
    labels: {
      style: { fontSize: '11px' },
      formatter: (v) => (v.length > 18 ? v.slice(0, 16) + '…' : v),
    },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: { labels: { style: { fontSize: '11px' } } },
  dataLabels: {
    enabled: true,
    style: { fontSize: '10px', fontWeight: 700, colors: ['#fff'] },
    offsetX: 20,
  },
  tooltip: { theme: 'dark' },
}))

// ---------------------------------------------------------------------------
// CHART 6 — Hourly (Vertical Bar)
// ---------------------------------------------------------------------------
const hourlySeries = computed(() => {
  const hours = dash.hourly.data.value?.hours || []
  return [{ name: 'Incidents', data: hours.map((h) => h.count) }]
})

const hourlyOptions = {
  chart: {
    type: 'bar',
    toolbar: { show: false },
    background: 'transparent',
    fontFamily: 'inherit',
  },
  plotOptions: { bar: { borderRadius: 4, columnWidth: '68%' } },
  colors: ['#8b5cf6'],
  grid: { borderColor: '#22304a', strokeDashArray: 3 },
  xaxis: {
    categories: Array.from({ length: 24 }, (_, i) => `${i}`),
    labels: { style: { fontSize: '10px' } },
    axisBorder: { show: false },
    axisTicks: { show: false },
    title: {
      text: 'Hour (PH time)',
      style: { fontSize: '11px', color: '#64748b', fontWeight: 500 },
    },
  },
  yaxis: { labels: { style: { fontSize: '10px' } }, min: 0 },
  dataLabels: { enabled: false },
  tooltip: { theme: 'dark' },
}
</script>

<template>
  <section class="analytics-tab">
    <!-- Header -->
    <header class="head">
      <div>
        <h1 class="h1">Analytics</h1>
        <p class="muted">
          Real-time metrics from Firestore. Auto-refreshes every 60s.
        </p>
      </div>
      <button
        class="refresh-btn"
        :class="{ 'refresh-btn--spinning': refreshing }"
        aria-label="Refresh analytics"
        @click="refresh"
      >
        <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
          <path
            d="M21 12a9 9 0 1 1-3-6.7M21 4v4h-4"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </header>

    <!-- Time window selector -->
    <div class="window-row">
      <span class="window-label">Time window</span>
      <div class="window-chips">
        <button
          v-for="d in [7, 30, 90]"
          :key="d"
          type="button"
          class="window-chip"
          :class="{ 'window-chip--on': windowDays === d }"
          @click="windowDays = d"
        >
          {{ d }} days
        </button>
      </div>
    </div>

    <!-- ============================================================
         KPI CARDS
         ============================================================ -->
    <div class="kpi-grid">
      <div class="kpi kpi--blue">
        <p class="kpi-label">Total incidents</p>
        <p class="kpi-value">{{ kpis.total }}</p>
      </div>
      <div class="kpi kpi--amber">
        <p class="kpi-label">Open now</p>
        <p class="kpi-value">{{ kpis.open }}</p>
      </div>
      <div class="kpi kpi--green">
        <p class="kpi-label">Median QRT</p>
        <p class="kpi-value">{{ formatSeconds(kpis.medianQrt) }}</p>
      </div>
      <div class="kpi kpi--purple">
        <p class="kpi-label">Ack rate</p>
        <p class="kpi-value">{{ Math.round(kpis.ackRate * 100) }}%</p>
      </div>
    </div>

    <!-- ============================================================
         CHARTS GRID
         ============================================================ -->
    <div class="charts-grid">
      <!-- Timeline — full width -->
      <div class="chart-card chart-card--full">
        <div class="chart-head">
          <h3 class="chart-title">Incidents over time</h3>
          <span class="tiny">Last 30 days</span>
        </div>
        <div class="chart-body">
          <apexchart
            v-if="dash.timeline.data.value"
            type="area"
            height="280"
            :options="timelineOptions"
            :series="timelineSeries"
          />
          <div v-else class="chart-loading"><div class="spinner" /></div>
        </div>
      </div>

      <!-- Types — donut -->
      <div class="chart-card">
        <div class="chart-head">
          <h3 class="chart-title">Incident types</h3>
          <span class="tiny">Distribution</span>
        </div>
        <div class="chart-body">
          <apexchart
            v-if="dash.summary.data.value"
            type="donut"
            height="320"
            :options="typeOptions"
            :series="typeSeries"
          />
          <div v-else class="chart-loading"><div class="spinner" /></div>
        </div>
      </div>

      <!-- Status — pie -->
      <div class="chart-card">
        <div class="chart-head">
          <h3 class="chart-title">Status breakdown</h3>
          <span class="tiny">Where incidents are now</span>
        </div>
        <div class="chart-body">
          <apexchart
            v-if="dash.summary.data.value"
            type="pie"
            height="320"
            :options="statusOptions"
            :series="statusSeries"
          />
          <div v-else class="chart-loading"><div class="spinner" /></div>
        </div>
      </div>

      <!-- Severity — radial bar -->
      <div class="chart-card">
        <div class="chart-head">
          <h3 class="chart-title">Severity mix</h3>
          <span class="tiny">Percentage of total</span>
        </div>
        <div class="chart-body">
          <apexchart
            v-if="dash.summary.data.value"
            type="radialBar"
            height="320"
            :options="severityOptions"
            :series="severitySeries"
          />
          <div v-else class="chart-loading"><div class="spinner" /></div>
        </div>
      </div>

      <!-- Barangay — horizontal bar -->
      <div class="chart-card">
        <div class="chart-head">
          <h3 class="chart-title">Top barangays</h3>
          <span class="tiny">Where incidents happen</span>
        </div>
        <div class="chart-body">
          <apexchart
            v-if="dash.barangays.data.value"
            type="bar"
            height="320"
            :options="barangayOptions"
            :series="barangaySeries"
          />
          <div v-else class="chart-loading"><div class="spinner" /></div>
        </div>
      </div>

      <!-- Hourly — vertical bar (full width) -->
      <div class="chart-card chart-card--full">
        <div class="chart-head">
          <h3 class="chart-title">Peak hours</h3>
          <span class="tiny">When incidents happen (PH time)</span>
        </div>
        <div class="chart-body">
          <apexchart
            v-if="dash.hourly.data.value"
            type="bar"
            height="240"
            :options="hourlyOptions"
            :series="hourlySeries"
          />
          <div v-else class="chart-loading"><div class="spinner" /></div>
        </div>
      </div>

      <!-- Responder leaderboard (full width) -->
      <div class="chart-card chart-card--full">
        <div class="chart-head">
          <h3 class="chart-title">Responder activity</h3>
          <span class="tiny">Top 20</span>
        </div>
        <div class="chart-body">
          <ul
            v-if="dash.responders.data.value?.responders?.length"
            class="leaderboard"
          >
            <li
              v-for="(r, idx) in dash.responders.data.value.responders"
              :key="r.uid"
              class="leader-item"
            >
              <span class="leader-rank">{{ idx + 1 }}</span>
              <span class="leader-avatar" aria-hidden="true">
                {{ (r.name || '?').charAt(0).toUpperCase() }}
              </span>
              <div class="leader-body">
                <p class="leader-name">{{ r.name }}</p>
                <p class="tiny">
                  {{ r.assigned }} assigned · {{ r.resolved }} resolved
                </p>
              </div>
              <span
                v-if="r.avg_qrts"
                class="leader-qrt"
                :class="{
                  'leader-qrt--fast': r.avg_qrts < 60,
                  'leader-qrt--slow': r.avg_qrts > 300,
                }"
              >
                {{ formatSeconds(r.avg_qrts) }}
              </span>
            </li>
          </ul>
          <p v-else class="tiny no-data">No responder activity yet.</p>
        </div>
      </div>
    </div>

    <!-- Hint for empty QRT -->
    <div v-if="dash.qrt.data.value?.count === 0" class="hint-card">
      <div class="hint-icon" aria-hidden="true">💡</div>
      <div>
        <p class="hint-title">QRT will populate after acknowledgment</p>
        <p class="tiny">
          When responders acknowledge incidents (via app or SMS), response
          time data appears here.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.analytics-tab {
  display: flex;
  flex-direction: column;
  padding-bottom: 20px;
}

/* ============================================================
   HEADER
   ============================================================ */
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.head .h1 { font-size: 1.5rem; }
.head .muted { margin-top: 4px; line-height: 1.5; }

.refresh-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  color: var(--text-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.refresh-btn:active { transform: scale(0.92); }
.refresh-btn--spinning svg { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ============================================================
   TIME WINDOW SELECTOR
   ============================================================ */
.window-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 16px;
}
.window-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
.window-chips {
  display: flex;
  gap: 4px;
  background: var(--bg-input);
  padding: 3px;
  border-radius: 10px;
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

/* ============================================================
   KPI CARDS
   ============================================================ */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}
.kpi {
  padding: 14px 16px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-elev);
}
.kpi--blue {
  background:
    radial-gradient(90% 100% at 0% 0%, rgba(59, 130, 246, 0.12) 0%, transparent 70%),
    var(--bg-elev);
  border-color: rgba(59, 130, 246, 0.3);
}
.kpi--amber {
  background:
    radial-gradient(90% 100% at 0% 0%, rgba(245, 158, 11, 0.12) 0%, transparent 70%),
    var(--bg-elev);
  border-color: rgba(245, 158, 11, 0.3);
}
.kpi--green {
  background:
    radial-gradient(90% 100% at 0% 0%, rgba(47, 158, 115, 0.12) 0%, transparent 70%),
    var(--bg-elev);
  border-color: rgba(47, 158, 115, 0.3);
}
.kpi--purple {
  background:
    radial-gradient(90% 100% at 0% 0%, rgba(139, 92, 246, 0.12) 0%, transparent 70%),
    var(--bg-elev);
  border-color: rgba(139, 92, 246, 0.3);
}
.kpi-label {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  font-weight: 700;
  margin-bottom: 6px;
}
.kpi-value {
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1;
  color: var(--text);
  letter-spacing: -0.02em;
}

/* ============================================================
   CHARTS GRID
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
  padding: 16px 12px 12px;
}
.chart-card--full {
  grid-column: 1 / -1;
}

.chart-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 0 6px 12px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.chart-title {
  font-size: 0.9375rem;
  font-weight: 700;
}
.chart-body {
  min-height: 200px;
}
.chart-loading {
  display: grid;
  place-items: center;
  min-height: 200px;
}
.spinner {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: #3b82f6;
  animation: spin 0.8s linear infinite;
}

/* ============================================================
   LEADERBOARD
   ============================================================ */
.leaderboard {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.leader-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-input);
}
.leader-rank {
  width: 24px;
  text-align: center;
  font-weight: 800;
  color: var(--text-dim);
  font-size: 0.875rem;
}
.leader-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #3b82f6;
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 0.9375rem;
  flex-shrink: 0;
}
.leader-body { min-width: 0; flex: 1; }
.leader-name {
  font-size: 0.875rem;
  font-weight: 650;
  margin-bottom: 2px;
}
.leader-qrt {
  font-size: 0.8125rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 8px;
  background: var(--bg-elev);
  color: var(--text-muted);
  flex-shrink: 0;
}
.leader-qrt--fast {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.14);
}
.leader-qrt--slow {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.14);
}
.no-data {
  text-align: center;
  padding: 24px 12px;
  color: var(--text-muted);
}

/* ============================================================
   HINT
   ============================================================ */
.hint-card {
  display: flex;
  gap: 12px;
  padding: 14px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: var(--radius);
  margin-top: 8px;
}
.hint-icon { font-size: 1.25rem; line-height: 1.2; flex-shrink: 0; }
.hint-title {
  font-size: 0.875rem;
  font-weight: 700;
  color: #f59e0b;
  margin-bottom: 4px;
}

/* ============================================================
   RESPONSIVE
   ============================================================ */

/* Tablet: 2-col grid for charts */
@media (min-width: 768px) {
  .head .h1 { font-size: 1.75rem; }

  .kpi-grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 24px;
  }
  .kpi { padding: 18px 20px; }
  .kpi-value { font-size: 2rem; }

  .charts-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
  .chart-card {
    padding: 20px 18px 16px;
  }
  .chart-title { font-size: 1rem; }
}

/* Desktop */
@media (min-width: 1024px) {
  .head { margin-bottom: 24px; }
  .head .h1 { font-size: 2rem; }
  .head .muted { font-size: 1rem; }

  .window-row { padding: 12px 18px; margin-bottom: 20px; }
  .window-chip { padding: 7px 16px; font-size: 0.8125rem; }

  .kpi-grid { gap: 16px; }
  .kpi { padding: 22px 26px; }
  .kpi-label { font-size: 0.75rem; }
  .kpi-value { font-size: 2.25rem; }

  .charts-grid { gap: 20px; }
  .chart-card {
    padding: 24px 24px 20px;
    border-radius: var(--radius-lg);
  }
  .chart-title { font-size: 1.0625rem; }
  .chart-head { padding-bottom: 14px; margin-bottom: 12px; }

  .leader-item { padding: 12px 16px; gap: 14px; }
  .leader-avatar { width: 40px; height: 40px; font-size: 1rem; }
  .leader-name { font-size: 0.9375rem; }
  .leader-qrt { font-size: 0.875rem; padding: 5px 12px; }
}

/* Wide desktop */
@media (min-width: 1440px) {
  .charts-grid { gap: 22px; }
}
</style>