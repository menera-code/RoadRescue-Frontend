<script setup>
import { ref, computed, watch } from 'vue'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

// ---------------------------------------------------------------------------
// FILTER STATE
// ---------------------------------------------------------------------------
const fromDate = ref('')
const toDate = ref('')
const statusFilter = ref('')
const typeFilter = ref('')
const barangayFilter = ref('')

// ---------------------------------------------------------------------------
// DATA
// ---------------------------------------------------------------------------
const incidents = ref([])
const loading = ref(true)
const error = ref('')
const total = ref(0)

async function fetchHistory() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (fromDate.value) params.set('from', fromDate.value)
    if (toDate.value) params.set('to', toDate.value)
    if (statusFilter.value) params.set('status', statusFilter.value)
    if (typeFilter.value) params.set('type', typeFilter.value)
    if (barangayFilter.value) params.set('barangay', barangayFilter.value)
    params.set('limit', '500')

    const resp = await fetch(`${API_URL}/analytics/history?${params}`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json()
    incidents.value = data.incidents || []
    total.value = data.total || 0
  } catch (e) {
    console.error('[HistoryTab] fetch failed', e)
    error.value = 'Could not load history.'
  } finally {
    loading.value = false
  }
}

// Fetch on mount + whenever filters change (debounced for text input)
let debounce = null
watch([fromDate, toDate, statusFilter, typeFilter, barangayFilter], () => {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(fetchHistory, 300)
})
fetchHistory()

// ---------------------------------------------------------------------------
// QUICK DATE PRESETS
// ---------------------------------------------------------------------------
function presetDays(n) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - n)
  toDate.value = to.toISOString().slice(0, 10)
  fromDate.value = from.toISOString().slice(0, 10)
}

function presetAllTime() {
  fromDate.value = ''
  toDate.value = ''
}

function clearFilters() {
  fromDate.value = ''
  toDate.value = ''
  statusFilter.value = ''
  typeFilter.value = ''
  barangayFilter.value = ''
}

const hasFilters = computed(
  () =>
    !!fromDate.value ||
    !!toDate.value ||
    !!statusFilter.value ||
    !!typeFilter.value ||
    !!barangayFilter.value
)

// ---------------------------------------------------------------------------
// FORMATTERS
// ---------------------------------------------------------------------------
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

const TYPE_ICONS = {
  flat_tire:       '🛞',
  battery:         '🔋',
  fuel:            '⛽',
  stalled_vehicle: '🛑',
  minor_collision: '🚗',
  major_collision: '💥',
  vehicle_fire:    '🔥',
  road_hazard:     '⚠️',
  other:           '❓',
}

function typeLabel(t) {
  return TYPE_LABELS[t] || t
}
function typeIcon(t) {
  return TYPE_ICONS[t] || '❓'
}

function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatSeconds(s) {
  if (s == null) return '—'
  if (s < 60) return `${Math.round(s)}s`
  return `${(s / 60).toFixed(1)}m`
}

function statusTone(status) {
  return {
    unverified: 'unverified',
    pending: 'pending',
    accepted: 'active',
    en_route: 'active',
    on_scene: 'active',
    resolved: 'resolved',
    cancelled: 'cancelled',
  }[status] || 'muted'
}

// ---------------------------------------------------------------------------
// EXPANDED ROW
// ---------------------------------------------------------------------------
const expandedId = ref(null)
function toggleRow(id) {
  expandedId.value = expandedId.value === id ? null : id
}

// ---------------------------------------------------------------------------
// CSV EXPORT
// ---------------------------------------------------------------------------
function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function exportCSV() {
  if (!incidents.value.length) return

  const headers = [
    'ID',
    'Date',
    'Type',
    'Severity',
    'Status',
    'Barangay',
    'Citizen',
    'Citizen Phone',
    'Responder',
    'QRT (seconds)',
    'Description',
    'Photos',
    'Video',
  ]

  const rows = incidents.value.map((i) => [
    i.id,
    formatDateTime(i.createdAt),
    typeLabel(i.type),
    i.severity,
    i.status,
    i.barangay,
    i.citizenName,
    i.citizenPhone,
    i.responderName,
    i.responseTimeSeconds ?? '',
    i.description,
    i.photoCount || 0,
    i.hasVideo ? 'yes' : '',
  ])

  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((r) => r.map(csvEscape).join(',')),
  ].join('\n')

  // BOM so Excel opens UTF-8 correctly
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `roadrescue-history-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="history-tab">
    <!-- Header -->
    <header class="head">
      <div>
        <h1 class="h1">History</h1>
        <p class="muted">
          {{ total }} {{ total === 1 ? 'incident' : 'incidents' }} found
        </p>
      </div>
      <button
        class="export-btn"
        :disabled="!incidents.length"
        @click="exportCSV"
      >
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
          <path
            d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>Export</span>
      </button>
    </header>

    <!-- Quick date presets -->
    <div class="preset-row">
      <button
        type="button"
        class="preset-chip"
        @click="presetDays(7)"
      >
        Last 7 days
      </button>
      <button
        type="button"
        class="preset-chip"
        @click="presetDays(30)"
      >
        Last 30 days
      </button>
      <button
        type="button"
        class="preset-chip"
        @click="presetDays(90)"
      >
        Last 90 days
      </button>
      <button
        type="button"
        class="preset-chip"
        @click="presetAllTime"
      >
        All time
      </button>
    </div>

    <!-- Filters -->
    <div class="filters">
      <div class="date-pair">
        <div class="date-field">
          <label for="from-date">From</label>
          <input
            id="from-date"
            v-model="fromDate"
            type="date"
            class="date-input"
          />
        </div>
        <div class="date-field">
          <label for="to-date">To</label>
          <input
            id="to-date"
            v-model="toDate"
            type="date"
            class="date-input"
          />
        </div>
      </div>

      <div class="select-pair">
        <select v-model="statusFilter" class="filter-select">
          <option value="">All statuses</option>
          <option value="unverified">Unverified</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="en_route">En route</option>
          <option value="on_scene">On scene</option>
          <option value="resolved">Resolved</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select v-model="typeFilter" class="filter-select">
          <option value="">All types</option>
          <option value="flat_tire">Flat Tire</option>
          <option value="battery">Battery</option>
          <option value="fuel">Out of Fuel</option>
          <option value="stalled_vehicle">Stalled Vehicle</option>
          <option value="minor_collision">Minor Crash</option>
          <option value="major_collision">Major Crash</option>
          <option value="vehicle_fire">Vehicle Fire</option>
          <option value="road_hazard">Road Hazard</option>
        </select>
      </div>

      <input
        v-model="barangayFilter"
        type="text"
        class="filter-input"
        placeholder="Filter by barangay…"
      />

      <button
        v-if="hasFilters"
        type="button"
        class="clear-btn"
        @click="clearFilters"
      >
        Clear all filters
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="state-block">
      <div class="state-spinner" aria-hidden="true" />
      <p class="tiny">Loading incidents…</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="state-block state-block--error">
      <p class="tiny">{{ error }}</p>
      <button class="btn btn--soft state-retry" @click="fetchHistory">
        Retry
      </button>
    </div>

    <!-- Empty -->
    <div v-else-if="!incidents.length" class="state-block">
      <div class="state-icon" aria-hidden="true">📋</div>
      <p class="state-title">No incidents found</p>
      <p class="tiny state-text">
        Try a different date range or clear your filters.
      </p>
    </div>

    <!-- Incident list -->
    <ul v-else class="list">
      <li
        v-for="inc in incidents"
        :key="inc.id"
        class="row"
        :class="{ 'row--open': expandedId === inc.id }"
      >
        <button
          type="button"
          class="row-head"
          :aria-expanded="expandedId === inc.id"
          @click="toggleRow(inc.id)"
        >
          <span class="row-icon" aria-hidden="true">{{ typeIcon(inc.type) }}</span>

          <span class="row-main">
            <span class="row-title-line">
              <span class="row-title">{{ typeLabel(inc.type) }}</span>
              <span
                class="status-chip"
                :class="`status-chip--${statusTone(inc.status)}`"
              >
                {{ inc.status }}
              </span>
            </span>

            <span class="row-meta">
              <span>{{ formatDateTime(inc.createdAt) }}</span>
              <template v-if="inc.barangay">
                · {{ inc.barangay }}
              </template>
            </span>
          </span>

          <span class="row-chev" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
              <path
                d="m6 9 6 6 6-6"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
        </button>

        <!-- Expanded details -->
        <div v-if="expandedId === inc.id" class="row-body">
          <div v-if="inc.description" class="detail-block">
            <p class="detail-label">Report</p>
            <p class="detail-value">{{ inc.description }}</p>
          </div>

          <div class="detail-grid">
            <div class="detail-block">
              <p class="detail-label">Severity</p>
              <p class="detail-value">
                <span class="severity-chip" :class="`severity-chip--${inc.severity}`">
                  {{ inc.severity }}
                </span>
              </p>
            </div>

            <div class="detail-block">
              <p class="detail-label">QRT</p>
              <p class="detail-value">{{ formatSeconds(inc.responseTimeSeconds) }}</p>
            </div>

            <div class="detail-block">
              <p class="detail-label">Citizen</p>
              <p class="detail-value">{{ inc.citizenName || '—' }}</p>
            </div>

            <div class="detail-block">
              <p class="detail-label">Responder</p>
              <p class="detail-value">{{ inc.responderName || '—' }}</p>
            </div>

            <div class="detail-block">
              <p class="detail-label">Photos</p>
              <p class="detail-value">
                {{ inc.photoCount || 0 }}
                <template v-if="inc.hasVideo">· 📹 1 video</template>
              </p>
            </div>

            <div class="detail-block">
              <p class="detail-label">Ref</p>
              <p class="detail-value detail-value--mono">
                {{ (inc.id || '').slice(0, 8).toUpperCase() }}
              </p>
            </div>
          </div>
        </div>
      </li>
    </ul>

    <!-- Footer note -->
    <p v-if="incidents.length" class="tiny footer-note">
      Showing {{ incidents.length }} of {{ total }} incidents.
    </p>
  </section>
</template>

<style scoped>
.history-tab {
  display: flex;
  flex-direction: column;
  padding-bottom: 20px;
}

/* ---------- Header ---------- */
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.head .h1 { font-size: 1.5rem; }
.head .muted { margin-top: 4px; }

.export-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 10px;
  background: #3b82f6;
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 650;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.export-btn:active:not(:disabled) { transform: scale(0.96); }
.export-btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* ---------- Presets ---------- */
.preset-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 8px;
  margin-bottom: 12px;
  scrollbar-width: none;
}
.preset-row::-webkit-scrollbar { display: none; }

.preset-chip {
  flex-shrink: 0;
  padding: 7px 12px;
  border-radius: 99px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}
.preset-chip:active {
  transform: scale(0.96);
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

/* ---------- Filters ---------- */
.filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.date-pair,
.select-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.date-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.date-field label {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding-left: 2px;
}

.date-input,
.filter-select,
.filter-input {
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  background: var(--bg-input);
  border: 1.5px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s ease;
  font-family: inherit;
}
.date-input:focus,
.filter-select:focus,
.filter-input:focus {
  border-color: #3b82f6;
}
.filter-select {
  appearance: none;
  cursor: pointer;
}

.clear-btn {
  align-self: flex-start;
  padding: 6px 12px;
  background: none;
  border: none;
  color: #3b82f6;
  font-size: 0.75rem;
  font-weight: 650;
  text-decoration: underline;
  cursor: pointer;
}

/* ---------- States ---------- */
.state-block {
  background: var(--bg-elev);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  padding: 40px 24px;
  text-align: center;
}
.state-block--error { border-color: rgba(239, 68, 68, 0.3); }
.state-spinner {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: #3b82f6;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.state-icon { font-size: 2rem; margin-bottom: 10px; opacity: 0.8; }
.state-title { font-size: 0.9375rem; font-weight: 650; margin-bottom: 4px; }
.state-text { line-height: 1.5; max-width: 30ch; margin-inline: auto; }
.state-retry { max-width: 140px; margin: 12px auto 0; }

/* ---------- Rows ---------- */
.list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: border-color 0.15s ease;
}
.row--open { border-color: rgba(59, 130, 246, 0.4); }

.row-head {
  display: grid;
  grid-template-columns: 32px 1fr 20px;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 12px 14px;
  background: none;
  border: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.row-head:active { background: var(--bg-input); }

.row-icon { font-size: 1.125rem; display: grid; place-items: center; }
.row-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }

.row-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.row-title {
  font-size: 0.875rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-chip {
  flex-shrink: 0;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 7px;
  border-radius: 5px;
}
.status-chip--unverified { color: #f59e0b; background: rgba(245, 158, 11, 0.14); }
.status-chip--pending    { color: #f59e0b; background: rgba(245, 158, 11, 0.14); }
.status-chip--active     { color: #3b82f6; background: rgba(59, 130, 246, 0.14); }
.status-chip--resolved   { color: var(--accent); background: var(--accent-soft); }
.status-chip--cancelled  { color: var(--text-dim); background: var(--bg-input); }
.status-chip--muted      { color: var(--text-muted); background: var(--bg-input); }

.row-meta {
  font-size: 0.6875rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-chev {
  display: grid;
  place-items: center;
  color: var(--text-dim);
  transition: transform 0.2s ease;
}
.row--open .row-chev { transform: rotate(180deg); color: #3b82f6; }

/* ---------- Expanded body ---------- */
.row-body {
  padding: 0 14px 14px;
  border-top: 1px solid var(--border);
  animation: expand 0.2s ease;
}
@keyframes expand {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.detail-block { margin-top: 12px; }
.detail-label {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.detail-value {
  font-size: 0.875rem;
  color: var(--text);
  line-height: 1.5;
  word-break: break-word;
}
.detail-value--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 16px;
}

.severity-chip {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 8px;
  border-radius: 5px;
}
.severity-chip--low      { color: #22c55e; background: rgba(34, 197, 94, 0.14); }
.severity-chip--medium   { color: #f59e0b; background: rgba(245, 158, 11, 0.14); }
.severity-chip--high     { color: #ef4444; background: rgba(239, 68, 68, 0.14); }
.severity-chip--critical { color: #fff; background: #dc2626; }

.footer-note {
  text-align: center;
  padding: 16px 8px 8px;
  color: var(--text-dim);
}

/* ============================================================
   RESPONSIVE
   ============================================================ */

/* Tablet: filters in one row, larger rows */
@media (min-width: 768px) {
  .head .h1 { font-size: 1.75rem; }
  .export-btn { padding: 10px 18px; font-size: 0.875rem; }

  .preset-row { overflow: visible; flex-wrap: wrap; }

  .filters {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1.2fr;
    gap: 12px;
    align-items: end;
  }
  .date-pair { grid-template-columns: 1fr 1fr; }
  .select-pair { display: contents; }
  .filter-input { min-height: 42px; }

  .row-head {
    grid-template-columns: 44px 1fr 24px;
    gap: 16px;
    padding: 16px 20px;
  }
  .row-icon { font-size: 1.375rem; }
  .row-title { font-size: 1rem; }
  .row-meta { font-size: 0.8125rem; }

  .row-body { padding: 4px 20px 20px; }
  .detail-grid { grid-template-columns: repeat(3, 1fr); gap: 16px 24px; }
  .detail-value { font-size: 0.9375rem; }
}

/* Desktop: even more breathing room */
@media (min-width: 1024px) {
  .head { margin-bottom: 24px; }
  .head .h1 { font-size: 2rem; }
  .head .muted { font-size: 1rem; }

  .filters {
    grid-template-columns: 2fr 1fr 1fr 1.4fr auto;
    gap: 14px;
    margin-bottom: 24px;
  }

  .list { gap: 10px; }
  .row-head { padding: 18px 24px; gap: 20px; }
  .row-title { font-size: 1.0625rem; }
  .row-meta { font-size: 0.875rem; }
  .status-chip { font-size: 0.6875rem; padding: 3px 9px; }

  .row-body { padding: 8px 24px 24px; }
  .detail-grid { grid-template-columns: repeat(4, 1fr); gap: 18px 28px; }
}
</style>