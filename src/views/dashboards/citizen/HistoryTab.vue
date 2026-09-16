<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useIncidents, STATUS_GROUPS } from '@/composables/useIncidents'

const auth = useAuthStore()

// ---------------------------------------------------------------------------
// Subscribe to my incidents (created by me)
// ---------------------------------------------------------------------------
const {
  incidents,
  loading,
  error,
} = useIncidents({
  statuses: null,       // all statuses
  scope: 'createdByMe', // only incidents where citizenUid == my uid
})

// ---------------------------------------------------------------------------
// FILTERS
// ---------------------------------------------------------------------------
const activeFilter = ref('all')

const FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'active',    label: 'Active' },
  { key: 'resolved',  label: 'Resolved' },
  { key: 'cancelled', label: 'Cancelled' },
]

const filtered = computed(() => {
  if (activeFilter.value === 'all') return incidents.value
  if (activeFilter.value === 'active') {
    return incidents.value.filter((i) =>
      ['unverified', 'pending', 'accepted', 'en_route', 'on_scene'].includes(i.status)
    )
  }
  return incidents.value.filter((i) => i.status === activeFilter.value)
})

// ---------------------------------------------------------------------------
// TYPE HELPERS
// ---------------------------------------------------------------------------
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

const TYPE_LABELS = {
  flat_tire:       'Flat Tire',
  battery:         'Dead Battery',
  fuel:            'Out of Fuel',
  stalled_vehicle: 'Stalled Vehicle',
  minor_collision: 'Minor Crash',
  major_collision: 'Major Crash',
  vehicle_fire:    'Vehicle Fire',
  road_hazard:     'Road Hazard',
  other:           'Other',
}

function typeIcon(t) {
  return TYPE_ICONS[t] || '❓'
}
function typeLabel(t) {
  return TYPE_LABELS[t] || 'Incident'
}

function statusLabel(status) {
  return {
    unverified: 'Awaiting review',
    pending:    'Waiting for responder',
    accepted:   'Responder accepted',
    en_route:   'Responder on the way',
    on_scene:   'Responder on scene',
    resolved:   'Resolved',
    cancelled:  'Cancelled',
  }[status] || status
}

function statusTone(status) {
  if (status === 'unverified') return 'unverified'
  if (status === 'pending') return 'pending'
  if (['accepted', 'en_route', 'on_scene'].includes(status)) return 'active'
  if (status === 'resolved') return 'resolved'
  if (status === 'cancelled') return 'cancelled'
  return 'muted'
}

function formatDate(ts) {
  if (!ts) return ''
  const d = ts instanceof Date ? ts : new Date(ts)
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(ts) {
  if (!ts) return ''
  const d = ts instanceof Date ? ts : new Date(ts)
  return d.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// EXPANDED ROW
// ---------------------------------------------------------------------------
const expandedId = ref(null)
function toggle(id) {
  expandedId.value = expandedId.value === id ? null : id
}
</script>

<template>
  <section class="history-tab">
    <header class="head">
      <h1 class="h1">My Reports</h1>
      <p class="muted">
        Incidents you've reported and their current status.
      </p>
    </header>

    <!-- Filter chips -->
    <div class="chips" role="tablist" aria-label="Filter incidents">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        type="button"
        role="tab"
        :aria-selected="activeFilter === f.key"
        class="chip"
        :class="{ 'chip--on': activeFilter === f.key }"
        @click="activeFilter = f.key"
      >
        {{ f.label }}
        <span v-if="f.key === 'all' && incidents.length" class="chip-count">
          {{ incidents.length }}
        </span>
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading && !incidents.length" class="state-block">
      <div class="state-spinner" aria-hidden="true" />
      <p class="tiny">Loading your reports…</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="state-block state-block--error">
      <p class="tiny">{{ error }}</p>
    </div>

    <!-- Empty state -->
    <div v-else-if="!filtered.length" class="state-block">
      <div class="state-icon" aria-hidden="true">
        {{ incidents.length === 0 ? '📋' : '🔍' }}
      </div>
      <p class="state-title">
        {{ incidents.length === 0 ? 'No reports yet' : 'Nothing to show' }}
      </p>
      <p class="tiny state-text">
        <template v-if="incidents.length === 0">
          When you submit a report, it'll appear here with live status updates.
        </template>
        <template v-else>
          No incidents match this filter. Try another tab.
        </template>
      </p>
    </div>

    <!-- List -->
    <ul v-else class="list">
      <li
        v-for="inc in filtered"
        :key="inc.id"
        class="card"
        :class="{ 'card--open': expandedId === inc.id }"
      >
        <!-- Card head -->
        <button
          type="button"
          class="card-head"
          :aria-expanded="expandedId === inc.id"
          @click="toggle(inc.id)"
        >
          <span class="card-icon" aria-hidden="true">
            {{ typeIcon(inc.type) }}
          </span>

          <span class="card-main">
            <span class="card-title-line">
              <span class="card-title">{{ typeLabel(inc.type) }}</span>
              <span
                class="status-chip"
                :class="`status-chip--${statusTone(inc.status)}`"
              >
                {{ statusLabel(inc.status) }}
              </span>
            </span>

            <span class="card-meta">
              {{ formatDate(inc.createdAt) }} · {{ formatTime(inc.createdAt) }}
              <template v-if="inc.barangay"> · {{ inc.barangay }}</template>
            </span>

            <span v-if="inc.description" class="card-desc">
              {{ inc.description }}
            </span>
          </span>

          <span class="card-chev" aria-hidden="true">
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
        <div v-if="expandedId === inc.id" class="card-body">
          <!-- Media thumbnails -->
          <div
            v-if="inc.photoUrls?.length || inc.videoUrl"
            class="media-row"
          >
            <template v-if="inc.photoUrls?.length">
              <img
                v-for="(url, i) in inc.photoUrls.slice(0, 3)"
                :key="i"
                :src="url"
                alt=""
                class="media-thumb"
                loading="lazy"
              />
            </template>
            <span v-if="inc.videoUrl" class="video-pill">📹 Video</span>
          </div>

          <!-- Detail grid -->
          <div class="detail-grid">
            <div class="detail-block">
              <p class="detail-label">Report ID</p>
              <p class="detail-value detail-value--mono">
                {{ (inc.id || '').slice(0, 8).toUpperCase() }}
              </p>
            </div>

            <div v-if="inc.responderName || inc.assignedResponderName" class="detail-block">
              <p class="detail-label">Responder</p>
              <p class="detail-value">
                {{ inc.assignedResponderName || inc.responderName }}
              </p>
            </div>

            <div v-if="inc.responseTimeSeconds" class="detail-block">
              <p class="detail-label">Acknowledged in</p>
              <p class="detail-value">{{ inc.responseTimeSeconds }}s</p>
            </div>

            <div v-if="inc.ml?.predictedType" class="detail-block">
              <p class="detail-label">AI classification</p>
              <p class="detail-value">
                {{ typeLabel(inc.ml.predictedType) }}
                <template v-if="inc.ml.confidence">
                  · {{ Math.round(inc.ml.confidence * 100) }}%
                </template>
              </p>
            </div>
          </div>

          <!-- Live status hint -->
          <p
            v-if="['unverified', 'pending', 'accepted', 'en_route', 'on_scene'].includes(inc.status)"
            class="live-hint"
          >
            <span class="live-dot" aria-hidden="true" />
            Live tracking — updates automatically
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.history-tab {
  display: flex;
  flex-direction: column;
}

/* ---------- Header ---------- */
.head {
  margin-bottom: 16px;
}
.head .h1 { font-size: 1.5rem; }
.head .muted {
  margin-top: 4px;
  line-height: 1.5;
}

/* ---------- Filter chips ---------- */
.chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 6px;
  margin-bottom: 16px;
  scrollbar-width: none;
}
.chips::-webkit-scrollbar { display: none; }

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-height: 34px;
  padding: 6px 14px;
  border-radius: 99px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.8125rem;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.chip:active { transform: scale(0.96); }
.chip--on {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.chip-count {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.2);
  font-size: 0.6875rem;
  font-weight: 700;
}
.chip--on .chip-count {
  background: rgba(255, 255, 255, 0.3);
}

/* ---------- States ---------- */
.state-block {
  background: var(--bg-elev);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  padding: 40px 24px;
  text-align: center;
  margin-top: 8px;
}
.state-block--error {
  border-color: rgba(239, 68, 68, 0.3);
}
.state-spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.state-icon {
  font-size: 2rem;
  margin-bottom: 10px;
  opacity: 0.8;
}
.state-title {
  font-size: 0.9375rem;
  font-weight: 650;
  margin-bottom: 4px;
}
.state-text {
  line-height: 1.5;
  max-width: 30ch;
  margin-inline: auto;
}

/* ---------- List ---------- */
.list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: border-color 0.15s ease;
}
.card--open {
  border-color: rgba(230, 57, 70, 0.4);
}

/* ---------- Card head ---------- */
.card-head {
  display: grid;
  grid-template-columns: 40px 1fr 20px;
  gap: 10px;
  align-items: flex-start;
  width: 100%;
  padding: 14px;
  background: none;
  border: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.card-head:active { background: var(--bg-input); }

.card-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  font-size: 1.25rem;
  background: var(--bg-input);
  border-radius: 10px;
  flex-shrink: 0;
}

.card-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.card-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.card-title {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text);
}

.status-chip {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 5px;
  white-space: nowrap;
}
.status-chip--unverified { color: #f59e0b; background: rgba(245, 158, 11, 0.14); }
.status-chip--pending    { color: #f59e0b; background: rgba(245, 158, 11, 0.14); }
.status-chip--active     { color: #3b82f6; background: rgba(59, 130, 246, 0.14); }
.status-chip--resolved   { color: var(--accent); background: var(--accent-soft); }
.status-chip--cancelled  { color: var(--text-dim); background: var(--bg-input); }
.status-chip--muted      { color: var(--text-muted); background: var(--bg-input); }

.card-meta {
  font-size: 0.6875rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.card-desc {
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: 1.45;
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-chev {
  display: grid;
  place-items: center;
  color: var(--text-dim);
  transition: transform 0.2s ease;
  margin-top: 4px;
}
.card--open .card-chev {
  transform: rotate(180deg);
  color: var(--primary);
}

/* ---------- Card body ---------- */
.card-body {
  padding: 0 14px 14px;
  border-top: 1px solid var(--border);
  animation: expand 0.2s ease;
}
@keyframes expand {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Media */
.media-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 12px;
  flex-wrap: wrap;
}
.media-thumb {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid var(--border);
  background: var(--bg-input);
}
.video-pill {
  font-size: 0.6875rem;
  font-weight: 700;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-muted);
}

/* Detail grid */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 16px;
  margin-top: 14px;
}
.detail-block { min-width: 0; }
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
  line-height: 1.4;
  word-break: break-word;
}
.detail-value--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* Live hint */
.live-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--accent);
  margin-top: 14px;
  padding: 8px 12px;
  background: var(--accent-soft);
  border-radius: 8px;
}
.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse-dot 1.5s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.4; transform: scale(0.85); }
}
</style>