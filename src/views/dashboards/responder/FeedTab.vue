<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import MediaGallery from '@/components/MediaGallery.vue'
import {
  useIncidents,
  acceptIncident,
  INCIDENT_STATUS,
  STATUS_GROUPS,
  statusLabel,
} from '@/composables/useIncidents'

const auth = useAuthStore()

// ---------------------------------------------------------------------------
// FILTER (internal tabs: New / Mine)
// ---------------------------------------------------------------------------
const activeFilter = ref('new') // 'new' | 'mine'

// ---------------------------------------------------------------------------
// SUBSCRIPTIONS
// ---------------------------------------------------------------------------
const {
  incidents: newIncidents,
  loading: loadingNew,
  error: errorNew,
} = useIncidents({
  statuses: STATUS_GROUPS.OPEN,
  scope: 'all',
})

const {
  incidents: myIncidents,
  loading: loadingMine,
  error: errorMine,
} = useIncidents({
  statuses: STATUS_GROUPS.ACTIVE,
  scope: 'assignedToMe',
})

const activeList = computed(() =>
  activeFilter.value === 'new' ? newIncidents.value : myIncidents.value
)

const isLoading = computed(() =>
  activeFilter.value === 'new' ? loadingNew.value : loadingMine.value
)

const hasError = computed(() =>
  activeFilter.value === 'new' ? errorNew.value : errorMine.value
)

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
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  )
}

onMounted(requestLocation)

// ---------------------------------------------------------------------------
// FORMATTING HELPERS
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
}

function typeIcon(type) {
  return TYPE_ICONS[type] || '❓'
}

function typeLabel(type) {
  return TYPE_LABELS[type] || 'Incident'
}

function timeAgo(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 30) return 'Just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
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
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
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
// CLEANUP
// ---------------------------------------------------------------------------
onBeforeUnmount(() => {
  // composable handles its own cleanup
})
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
    </div>

    <!-- Error banner -->
    <p v-if="acceptError" class="error-banner">{{ acceptError }}</p>
    <p v-else-if="hasError" class="error-banner">{{ hasError }}</p>

    <!-- Loading -->
    <div v-if="isLoading && !activeList.length" class="state-block">
      <div class="state-spinner" aria-hidden="true" />
      <p class="tiny">Loading incidents…</p>
    </div>

    <!-- Empty state -->
    <div v-else-if="!activeList.length" class="state-block">
      <div class="state-icon" aria-hidden="true">
        {{ activeFilter === 'new' ? '📭' : '🚑' }}
      </div>
      <p class="state-title">
        {{
          activeFilter === 'new'
            ? 'No pending incidents'
            : 'No active incidents'
        }}
      </p>
      <p class="tiny state-text">
        {{
          activeFilter === 'new'
            ? 'New requests will appear here in real time.'
            : 'Accept a request from the New tab to get started.'
        }}
      </p>
    </div>

    <!-- Incident list -->
    <ul v-else class="list">
      <li
        v-for="inc in activeList"
        :key="inc.id"
        class="card"
        :class="{ 'card--mine': activeFilter === 'mine' }"
      >
        <!-- Card head -->
        <div class="card-head">
          <div class="card-type">
            <span class="card-type-icon" aria-hidden="true">
              {{ typeIcon(inc.type) }}
            </span>
            <span class="card-type-label">{{ typeLabel(inc.type) }}</span>
          </div>
          <span class="card-time tiny">{{ timeAgo(inc.createdAt) }}</span>
        </div>

        <!-- Description -->
        <p v-if="inc.description" class="card-desc">
          {{ inc.description }}
        </p>

        <!-- Meta row -->
        <div class="card-meta">
          <span v-if="inc.barangay" class="card-meta-item">
            <span aria-hidden="true">📍</span>
            {{ inc.barangay }}
          </span>
          <span
            v-if="formatDistance(distanceTo(inc))"
            class="card-meta-item"
          >
            <span aria-hidden="true">🚶</span>
            {{ formatDistance(distanceTo(inc)) }}
          </span>
        </div>

        <!-- Media thumbnails -->
        <MediaGallery
          v-if="inc.photoUrls?.length || inc.videoUrl"
          :photo-urls="inc.photoUrls || []"
          :video-url="inc.videoUrl || null"
          mode="compact"
          class="card-media"
        />

        <!-- Citizen name -->
        <p v-if="inc.citizenName" class="card-citizen tiny">
          Reported by {{ inc.citizenName }}
        </p>

        <!-- Status chip for "Mine" tab -->
        <div v-if="activeFilter === 'mine'" class="card-status">
          <span class="status-chip" :class="`status-chip--${inc.status}`">
            {{ statusLabel(inc.status) }}
          </span>
        </div>

        <!-- Accept button -->
        <button
          v-if="activeFilter === 'new'"
          class="btn btn--accept"
          :disabled="acceptingId === inc.id"
          @click="onAccept(inc)"
        >
          {{ acceptingId === inc.id ? 'Accepting…' : 'Accept' }}
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

/* ---------- Header ---------- */
.head {
  margin-bottom: 16px;
}

.head .h1 {
  font-size: 1.5rem;
}

.head .muted {
  margin-top: 4px;
  line-height: 1.5;
}

/* ---------- Filter row ---------- */
.filter-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 4px;
  margin-bottom: 18px;
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
  font-size: 0.9375rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-btn:active {
  transform: scale(0.97);
}

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

.filter-count--green {
  background: var(--accent);
}

/* ---------- Error banner ---------- */
.error-banner {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius);
  padding: 10px 14px;
  font-size: 0.8125rem;
  color: var(--danger);
  margin-bottom: 14px;
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

.state-spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

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

/* ---------- Incident list ---------- */
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
}

.card--mine {
  border-color: rgba(47, 158, 115, 0.35);
  background:
    radial-gradient(
      90% 100% at 50% 0%,
      var(--accent-soft) 0%,
      transparent 70%
    ),
    var(--bg-elev);
}

@keyframes card-in {
  from {
    transform: translateY(6px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
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

.card-type-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.card-type-label {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
}

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

/* Meta row */
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

/* Media thumbnails */
.card-media {
  margin-bottom: 10px;
}

/* Citizen */
.card-citizen {
  margin-bottom: 12px;
}

/* Status chip */
.card-status {
  margin-bottom: 12px;
}

.status-chip {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 10px;
  border-radius: 6px;
}

.status-chip--accepted {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.14);
}

.status-chip--en_route {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.14);
}

.status-chip--on_scene {
  color: var(--accent);
  background: var(--accent-soft);
}

/* Accept button */
.btn--accept {
  background: linear-gradient(
    160deg,
    #3cb886 0%,
    var(--accent) 55%,
    #267a58 100%
  );
  color: #fff;
  font-size: 0.9375rem;
  font-weight: 700;
  min-height: 46px;
  box-shadow: 0 4px 12px rgba(47, 158, 115, 0.35);
  margin-top: 4px;
}

.btn--accept:active:not(:disabled) {
  transform: scale(0.97);
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

.link:disabled {
  opacity: 0.6;
}
</style>