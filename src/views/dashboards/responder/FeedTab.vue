<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  getIncidentIcon,
  getIncidentLabel,
  normalizeIncidentType,
} from '@/utils/incidentTypes'
import { useAuthStore } from '@/stores/auth'
import MediaGallery from '@/components/MediaGallery.vue'
import {
  useIncidents,
  acceptIncident,
  resolveIncident,
  STATUS_GROUPS,
  statusLabel,
} from '@/composables/useIncidents'

const auth = useAuthStore()

// ---------------------------------------------------------------------------
// FILTER
// ---------------------------------------------------------------------------
const activeFilter = ref('new') // 'new' | 'mine' | 'history'

// ---------------------------------------------------------------------------
// SUBSCRIPTIONS
// ---------------------------------------------------------------------------
// Feed — pending incidents visible to this responder
const {
  incidents: newIncidentsRaw,
  loading: loadingNew,
  error: errorNew,
} = useIncidents({
  statuses: STATUS_GROUPS.OPEN,
  scope: 'all',
})

// Mine — active incidents assigned to this responder
const {
  incidents: myIncidents,
  loading: loadingMine,
  error: errorMine,
} = useIncidents({
  statuses: STATUS_GROUPS.ACTIVE,
  scope: 'assignedToMe',
})

// History — resolved + cancelled incidents assigned to this responder
const {
  incidents: historyIncidents,
  loading: loadingHistory,
  error: errorHistory,
} = useIncidents({
  statuses: STATUS_GROUPS.DONE,
  scope: 'assignedToMe',
})

// ---------------------------------------------------------------------------
// NEW TAB FILTER
// ---------------------------------------------------------------------------
const newIncidents = computed(() => {
  if (!auth.user?.uid) return []

  return newIncidentsRaw.value.filter((inc) => {
    if (Array.isArray(inc.assignedResponderUids)) {
      return inc.assignedResponderUids.includes(auth.user.uid)
    }

    return inc.assignedResponderUid === auth.user.uid
  })
})

// ---------------------------------------------------------------------------
// HISTORY FILTERS
// ---------------------------------------------------------------------------
const historyDateFilter = ref('all')
const historyTypeFilter = ref('all')
const historyStatusFilter = ref('all')

const HISTORY_TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'accident', label: '🚗 Accident' },
  { value: 'medical', label: '🚑 Medical' },
  { value: 'fire', label: '🔥 Fire' },
  { value: 'road_hazard', label: '⚠️ Road hazard' },
  { value: 'emergency', label: '🆘 Emergency' },

  // Legacy types — kept for incidents created before the type rename
  { value: 'flat_tire', label: '🛞 Flat tire' },
  { value: 'battery', label: '🔋 Dead battery' },
  { value: 'fuel', label: '⛽ Out of fuel' },
  { value: 'stalled_vehicle', label: '🛑 Stalled vehicle' },
  { value: 'minor_collision', label: '🚗 Minor crash' },
  { value: 'major_collision', label: '💥 Major crash' },
  { value: 'vehicle_fire', label: '🔥 Vehicle fire' },
]

const HISTORY_STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'cancelled', label: 'Cancelled' },
]

function _toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value.toDate === 'function') return value.toDate()

  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

const historyFiltersActive = computed(() =>
  historyDateFilter.value !== 'all' ||
  historyTypeFilter.value !== 'all' ||
  historyStatusFilter.value !== 'all'
)

const filteredHistory = computed(() => {
  const now = Date.now()
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const filtered = historyIncidents.value.filter((inc) => {
    if (
      historyTypeFilter.value !== 'all' &&
      normalizeIncidentType(inc.type) !==
        normalizeIncidentType(historyTypeFilter.value)
    ) {
      return false
    }

    if (
      historyStatusFilter.value !== 'all' &&
      inc.status !== historyStatusFilter.value
    ) {
      return false
    }

    if (historyDateFilter.value !== 'all') {
      const d = _toDate(
        inc.resolvedAt || inc.updatedAt || inc.createdAt
      )

      if (!d) return false

      if (historyDateFilter.value === 'today') {
        if (d.getTime() < startOfToday.getTime()) return false
      } else if (historyDateFilter.value === '7d') {
        if (d.getTime() < now - 7 * 86400000) return false
      } else if (historyDateFilter.value === '30d') {
        if (d.getTime() < now - 30 * 86400000) return false
      }
    }

    return true
  })

  // Sort by most recently resolved/updated, falling back to createdAt
  return [...filtered].sort((a, b) => {
    const da =
      _toDate(a.resolvedAt || a.updatedAt || a.createdAt)?.getTime() || 0

    const db =
      _toDate(b.resolvedAt || b.updatedAt || b.createdAt)?.getTime() || 0

    return db - da
  })
})

// ---------------------------------------------------------------------------
// ACTIVE LIST + LOADING / ERROR
// ---------------------------------------------------------------------------
const activeList = computed(() => {
  if (activeFilter.value === 'new') return newIncidents.value
  if (activeFilter.value === 'mine') return myIncidents.value

  return filteredHistory.value
})

const isLoading = computed(() => {
  if (activeFilter.value === 'new') return loadingNew.value
  if (activeFilter.value === 'mine') return loadingMine.value

  return loadingHistory.value
})

const hasError = computed(() => {
  if (activeFilter.value === 'new') return errorNew.value
  if (activeFilter.value === 'mine') return errorMine.value

  return errorHistory.value
})

// ---------------------------------------------------------------------------
// USER LOCATION
// ---------------------------------------------------------------------------
const userPos = ref(null)
const locating = ref(false)

function requestLocation() {
  if (!('geolocation' in navigator)) return

  locating.value = true

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false

      userPos.value = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      }
    },
    () => {
      locating.value = false
    },
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 60000,
    }
  )
}

onMounted(requestLocation)

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function typeIcon(type) {
  return getIncidentIcon(type)
}

function typeLabel(type) {
  return getIncidentLabel(type)
}

function timeAgo(date) {
  const d = _toDate(date)
  if (!d) return ''

  const diff = Math.floor((Date.now() - d.getTime()) / 1000)

  if (diff < 30) return 'Just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`

  return `${Math.floor(diff / 86400)}d ago`
}

function formatDate(date) {
  const d = _toDate(date)
  if (!d) return ''

  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function distanceTo(incident) {
  if (!userPos.value || !incident.location) return null

  const { lat: lat1, lng: lon1 } = userPos.value
  const lat2 = incident.location.latitude
  const lon2 = incident.location.longitude

  const R = 6371000
  const toRad = (x) => (x * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(meters) {
  if (meters == null) return ''
  if (meters < 1000) return `${Math.round(meters)} m away`

  return `${(meters / 1000).toFixed(1)} km away`
}

// ---------------------------------------------------------------------------
// ACCEPT FLOW
// ---------------------------------------------------------------------------
const acceptingId = ref(null)
const acceptError = ref('')

async function onAccept(incident) {
  if (acceptingId.value) return

  acceptingId.value = incident.id
  acceptError.value = ''

  try {
    await acceptIncident(incident.id, {
      uid: auth.user?.uid,
      fullName: auth.profile?.fullName || '',
    })

    activeFilter.value = 'mine'
  } catch (e) {
    console.error('[FeedTab] accept failed', e)

    acceptError.value = 'Could not accept. Try again.'

    setTimeout(() => (acceptError.value = ''), 3000)
  } finally {
    acceptingId.value = null
  }
}

// ---------------------------------------------------------------------------
// RESOLVE FLOW → AUTO-SWITCH TO HISTORY
// ---------------------------------------------------------------------------
const resolvingId = ref(null)
const resolveError = ref('')
const justResolvedId = ref(null)

async function onResolve(incident) {
  if (resolvingId.value) return

  if (!confirm(
    'Mark this incident as responded and completed?\n\n' +
    'The admin will see it as resolved in analytics.\n' +
    'It will move to your History tab.'
  )) return

  resolvingId.value = incident.id
  resolveError.value = ''

  try {
    await resolveIncident(incident.id, {
      uid: auth.user?.uid,
      fullName: auth.profile?.fullName || '',
    })

    justResolvedId.value = incident.id

    setTimeout(() => {
      activeFilter.value = 'history'

      // Reset the history filters so the new entry is visible
      historyDateFilter.value = 'all'
      historyTypeFilter.value = 'all'
      historyStatusFilter.value = 'all'
    }, 500)

    setTimeout(() => {
      justResolvedId.value = null
    }, 4000)
  } catch (e) {
    console.error('[FeedTab] resolve failed', e)

    resolveError.value = 'Could not mark as responded. Try again.'

    setTimeout(() => (resolveError.value = ''), 3000)
  } finally {
    resolvingId.value = null
  }
}

// Manual jump to History
function goToHistory() {
  activeFilter.value = 'history'
}
</script>

<template>
  <section class="feed-tab">
    <!-- Header -->
    <header class="head">
      <h1 class="h1">Incidents</h1>
      <p class="muted">
        Real-time feed of nearby requests. Tap accept to respond.
      </p>
    </header>

    <!-- Filter tabs -->
    <div class="filter-row" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="activeFilter === 'new'"
        class="filter-btn"
        :class="{ 'filter-btn--on': activeFilter === 'new' }"
        @click="activeFilter = 'new'"
      >
        New
        <span v-if="newIncidents.length" class="filter-count">
          {{ newIncidents.length }}
        </span>
      </button>

      <button
        type="button"
        role="tab"
        :aria-selected="activeFilter === 'mine'"
        class="filter-btn"
        :class="{ 'filter-btn--on': activeFilter === 'mine' }"
        @click="activeFilter = 'mine'"
      >
        Mine
        <span
          v-if="myIncidents.length"
          class="filter-count filter-count--green"
        >
          {{ myIncidents.length }}
        </span>
      </button>

      <button
        type="button"
        role="tab"
        :aria-selected="activeFilter === 'history'"
        class="filter-btn"
        :class="{ 'filter-btn--on': activeFilter === 'history' }"
        @click="activeFilter = 'history'"
      >
        History
        <span
          v-if="historyIncidents.length"
          class="filter-count filter-count--grey"
        >
          {{ historyIncidents.length }}
        </span>
      </button>
    </div>

    <!-- History filters -->
    <div
      v-if="activeFilter === 'history'"
      class="history-filters"
    >
      <label class="hf-field">
        <span class="hf-label">When</span>
        <select v-model="historyDateFilter" class="hf-select">
          <option value="all">All time</option>
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </label>

      <label class="hf-field">
        <span class="hf-label">Type</span>
        <select v-model="historyTypeFilter" class="hf-select">
          <option
            v-for="opt in HISTORY_TYPE_OPTIONS"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
      </label>

      <label class="hf-field">
        <span class="hf-label">Status</span>
        <select v-model="historyStatusFilter" class="hf-select">
          <option
            v-for="opt in HISTORY_STATUS_OPTIONS"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
      </label>
    </div>

    <!-- Error banners -->
    <p v-if="acceptError" class="error-banner">
      {{ acceptError }}
    </p>
    <p v-else-if="resolveError" class="error-banner">
      {{ resolveError }}
    </p>
    <p v-else-if="hasError" class="error-banner">
      {{ hasError }}
    </p>

    <!-- Loading -->
    <div v-if="isLoading && !activeList.length" class="state-block">
      <div class="state-spinner" aria-hidden="true" />
      <p class="tiny">Loading incidents…</p>
    </div>

    <!-- Empty state -->
    <div v-else-if="!activeList.length" class="state-block">
      <div class="state-icon" aria-hidden="true">
        {{ activeFilter === 'new' ? '📭' : activeFilter === 'mine' ? '🚑' : '📂' }}
      </div>

      <p class="state-title">
        {{
          activeFilter === 'new'  ? 'No pending incidents' :
          activeFilter === 'mine' ? 'No active incidents' :
          historyFiltersActive
            ? 'No matches for current filters'
            : 'No history yet'
        }}
      </p>

      <p class="tiny state-text">
        {{
          activeFilter === 'new'
            ? 'New requests will appear here in real time.'
            : activeFilter === 'mine'
            ? 'Accept a request from the New tab to get started.'
            : historyFiltersActive
            ? 'Try widening the date range or clearing the filters.'
            : 'Responded and cancelled incidents will appear here.'
        }}
      </p>
    </div>

    <!-- Incident list -->
    <ul v-else class="list">
      <li
        v-for="inc in activeList"
        :key="inc.id"
        class="card"
        :class="{
          'card--mine': activeFilter === 'mine',
          'card--history': activeFilter === 'history',
          'card--resolved': justResolvedId === inc.id,
          'card--cancelled': inc.status === 'cancelled',
          'card--emergency': inc.type === 'emergency',
        }"
      >
        <!-- Card head -->
        <div class="card-head">
          <div class="card-type">
            <span class="card-type-icon" aria-hidden="true">
              {{ typeIcon(inc.type) }}
            </span>

            <span class="card-type-label">
              {{ typeLabel(inc.type) }}
            </span>

            <span
              v-if="inc.type === 'emergency'"
              class="card-type-sos"
            >
              SOS
            </span>
          </div>

          <span class="card-time tiny">
            {{
              activeFilter === 'history'
                ? formatDate(inc.resolvedAt || inc.updatedAt || inc.createdAt)
                : timeAgo(inc.createdAt)
            }}
          </span>
        </div>

        <!-- Description -->
        <p v-if="inc.description" class="card-desc">
          {{ inc.description }}
        </p>

        <!-- Emergency audio -->
        <div
          v-if="inc.type === 'emergency' && inc.audioUrl"
          class="card-audio-pill"
        >
          <span aria-hidden="true">🎤</span>
          <span>Voice message</span>
        </div>

        <!-- Meta -->
        <div class="card-meta">
          <span v-if="inc.barangay" class="card-meta-item">
            <span aria-hidden="true">📍</span>
            {{ inc.barangay }}
          </span>

          <span
            v-if="activeFilter !== 'history' && formatDistance(distanceTo(inc))"
            class="card-meta-item"
          >
            <span aria-hidden="true">🚶</span>
            {{ formatDistance(distanceTo(inc)) }}
          </span>

          <span
            v-if="activeFilter === 'history' && inc.respondedDurationSeconds != null"
            class="card-meta-item"
          >
            <span aria-hidden="true">⏱</span>
            {{ Math.round(inc.respondedDurationSeconds / 60) }} min response
          </span>
        </div>

        <!-- Media -->
        <MediaGallery
          v-if="inc.photoUrls?.length || inc.videoUrl"
          :photo-urls="inc.photoUrls || []"
          :video-url="inc.videoUrl || null"
          mode="compact"
          class="card-media"
        />

        <!-- Citizen -->
        <p v-if="inc.citizenName" class="card-citizen tiny">
          Reported by {{ inc.citizenName }}
        </p>

        <!-- Status chip (Mine + History) -->
        <div v-if="activeFilter !== 'new'" class="card-status">
          <span class="status-chip" :class="`status-chip--${inc.status}`">
            {{ statusLabel(inc.status) }}
          </span>
        </div>

        <!-- Accept button (New) -->
        <button
          v-if="activeFilter === 'new'"
          class="btn btn--accept"
          :disabled="acceptingId === inc.id"
          @click="onAccept(inc)"
        >
          {{ acceptingId === inc.id ? 'Accepting…' : 'Accept' }}
        </button>

        <!-- Resolve button (Mine) -->
        <button
          v-if="activeFilter === 'mine'"
          class="btn btn--resolve"
          :class="{ 'btn--resolve-done': justResolvedId === inc.id }"
          :disabled="resolvingId === inc.id || justResolvedId === inc.id"
          @click="onResolve(inc)"
        >
          <template v-if="justResolvedId === inc.id">
            ✓ Marked as responded
          </template>
          <template v-else-if="resolvingId === inc.id">
            Saving…
          </template>
          <template v-else>
            ✓ Mark as Responded
          </template>
        </button>
      </li>
    </ul>

    <!-- Location hint -->
    <p
      v-if="!userPos && activeFilter === 'new' && activeList.length"
      class="tiny location-hint"
    >
      <button
        type="button"
        class="link"
        :disabled="locating"
        @click="requestLocation"
      >
        {{ locating ? 'Locating…' : 'Enable location to see distances' }}
      </button>
    </p>
  </section>
</template>

<style scoped>
.feed-tab {
  display: flex;
  flex-direction: column;
}

.head { margin-bottom: 16px; }
.head .h1 { font-size: 1.5rem; }
.head .muted { margin-top: 4px; line-height: 1.5; }

/* Filter row — 3 columns */
.filter-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 4px;
  margin-bottom: 12px;
}

.filter-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 42px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted);
  font-weight: 650;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.15s ease;
}
.filter-btn:active { transform: scale(0.97); }
.filter-btn--on {
  background: var(--bg-elev);
  color: var(--text);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
}

.filter-count {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 700;
}
.filter-count--green { background: var(--accent); }
.filter-count--grey  { background: #6b7280; }

/* History filters */
.history-filters {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;
  padding: 12px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.hf-field { display: flex; flex-direction: column; gap: 4px; }
.hf-label {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.hf-select {
  background: var(--bg-input);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.8125rem;
  font-family: inherit;
  cursor: pointer;
}
.hf-select:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

/* Error banner */
.error-banner {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius);
  padding: 10px 14px;
  font-size: 0.8125rem;
  color: var(--danger);
  margin-bottom: 14px;
}

/* States */
.state-block {
  background: var(--bg-elev);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  padding: 40px 24px;
  text-align: center;
  margin-top: 8px;
}
.state-spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }

.state-icon {
  font-size: 2rem;
  line-height: 1;
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

/* List */
.list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  animation: card-in 0.24s ease;
  transition: all 0.2s ease;
}
.card--mine {
  border-color: rgba(47, 158, 115, 0.35);
  background:
    radial-gradient(90% 100% at 50% 0%, var(--accent-soft) 0%, transparent 70%),
    var(--bg-elev);
}
.card--history {
  background: var(--bg-elev);
  opacity: 0.94;
}
.card--cancelled {
  border-color: rgba(239, 68, 68, 0.25);
}
.card--emergency {
  border-color: rgba(230, 57, 70, 0.4);
}
.card--resolved {
  border-color: rgba(47, 158, 115, 0.7);
  background:
    radial-gradient(90% 100% at 50% 0%, rgba(47, 158, 115, 0.18) 0%, transparent 70%),
    var(--bg-elev);
  box-shadow: 0 0 20px rgba(47, 158, 115, 0.3);
}
@keyframes card-in {
  from { transform: translateY(6px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}

/* Card head */
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.card-type {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.card-type-icon { font-size: 1.25rem; line-height: 1; }
.card-type-label {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
}
.card-type-sos {
  font-size: 0.5625rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 3px 7px;
  border-radius: 5px;
  background: #e63946;
  color: #fff;
  animation: sos-blink 1.2s ease-in-out infinite alternate;
}
@keyframes sos-blink { from { opacity: 1; } to { opacity: 0.6; } }

.card-time {
  flex-shrink: 0;
  white-space: nowrap;
}

/* Description */
.card-desc {
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin-bottom: 10px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Audio pill */
.card-audio-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 99px;
  background: rgba(230, 57, 70, 0.12);
  border: 1px solid rgba(230, 57, 70, 0.3);
  color: #e63946;
  font-size: 0.75rem;
  font-weight: 650;
  margin-bottom: 10px;
}

/* Meta */
.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}
.card-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.card-media { margin-bottom: 10px; }
.card-citizen { margin-bottom: 12px; }

/* Status chip */
.card-status { margin-bottom: 12px; }
.status-chip {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 10px;
  border-radius: 6px;
}
.status-chip--accepted  { color: #f59e0b; background: rgba(245, 158, 11, 0.14); }
.status-chip--en_route  { color: #3b82f6; background: rgba(59, 130, 246, 0.14); }
.status-chip--on_scene  { color: var(--accent); background: var(--accent-soft); }
.status-chip--resolved  { color: var(--accent); background: var(--accent-soft); }
.status-chip--cancelled { color: #ef4444; background: rgba(239, 68, 68, 0.14); }

/* Accept button */
.btn--accept {
  background: linear-gradient(160deg, #3cb886 0%, var(--accent) 55%, #267a58 100%);
  color: #fff;
  font-size: 0.9375rem;
  font-weight: 700;
  min-height: 46px;
  box-shadow: 0 4px 12px rgba(47, 158, 115, 0.35);
  margin-top: 4px;
  width: 100%;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  font-family: inherit;
}
.btn--accept:active:not(:disabled) { transform: scale(0.97); }

/* Resolve button */
.btn--resolve {
  background: linear-gradient(160deg, #4f8ff7 0%, #3b82f6 55%, #2563eb 100%);
  color: #fff;
  font-size: 0.9375rem;
  font-weight: 700;
  min-height: 46px;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
  margin-top: 4px;
  width: 100%;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s ease;
  font-family: inherit;
}
.btn--resolve:active:not(:disabled) { transform: scale(0.97); }
.btn--resolve:disabled { opacity: 0.7; cursor: not-allowed; }
.btn--resolve-done {
  background: linear-gradient(160deg, #3cb886 0%, #2f9e73 55%, #267a58 100%);
  box-shadow: 0 4px 12px rgba(47, 158, 115, 0.5);
  opacity: 1 !important;
  cursor: default;
}

/* Location hint */
.location-hint {
  text-align: center;
  padding: 16px 0 8px;
}
.link {
  background: none;
  border: none;
  color: var(--accent);
  text-decoration: underline;
  padding: 0;
  font-size: inherit;
  cursor: pointer;
}
.link:disabled { opacity: 0.6; }

/* Mobile */
@media (max-width: 480px) {
  .filter-btn { font-size: 0.8125rem; gap: 4px; padding: 0 6px; }
  .history-filters { grid-template-columns: 1fr; }
}
</style>
