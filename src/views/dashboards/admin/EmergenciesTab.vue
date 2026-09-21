<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { db } from '@/firebase'
import { searchBarangays } from '@/data/barangays'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const CALAPAN_CENTER = [121.1803, 13.4108]
const DEFAULT_ZOOM = 13

// =========================================================================
// MAP STYLE OPTIONS
// =========================================================================
const SATELLITE_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}'],
      tileSize: 256,
    },
  },
  layers: [{
    id: 'satellite-layer',
    type: 'raster',
    source: 'satellite',
    minzoom: 0,
    maxzoom: 19,
  }],
}

const STYLE_OPTIONS = [
  {
    key: 'bright',
    label: 'Colorful',
    hint: 'Bright, detailed',
    preview: 'linear-gradient(135deg, #a8d8ea 0%, #f4e4a1 50%, #b8d4a0 100%)',
    style: 'https://tiles.openfreemap.org/styles/bright',
  },
  {
    key: 'positron',
    label: 'Light',
    hint: 'Minimal, clean',
    preview: 'linear-gradient(135deg, #f5f5f0 0%, #e8e8e0 100%)',
    style: 'https://tiles.openfreemap.org/styles/positron',
  },
  {
    key: 'satellite',
    label: 'Satellite',
    hint: 'Aerial imagery',
    preview: 'linear-gradient(135deg, #1a3a2a 0%, #2d5a3f 50%, #4a7a5a 100%)',
    style: SATELLITE_STYLE,
  },
]

const STORAGE_KEY = 'rr:adminMapStyle'
const DEFAULT_STYLE_KEY = 'satellite' // admins usually prefer aerial for dispatch

// =========================================================================
// DATA
// =========================================================================
const incidents = ref([])
const loading = ref(true)
const error = ref('')
let unsub = null

function subscribe() {
  const q = query(collection(db, 'incidents'), where('type', '==', 'emergency'))
  unsub = onSnapshot(
    q,
    (snap) => {
      const list = []
      snap.forEach((d) => {
        const data = d.data()
        list.push({
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || null,
          acknowledgedAt: data.acknowledgedAt?.toDate?.() || null,
          acceptedAt: data.acceptedAt?.toDate?.() || null,
          resolvedAt: data.resolvedAt?.toDate?.() || null,
          cancelledAt: data.cancelledAt?.toDate?.() || null,
        })
      })
      list.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      incidents.value = list
      loading.value = false
    },
    (e) => {
      console.error('[EmergenciesTab] snapshot error', e)
      error.value = 'Could not load emergencies.'
      loading.value = false
    }
  )
}

// =========================================================================
// DERIVED
// =========================================================================
const activeEmergencies = computed(() =>
  incidents.value.filter((e) =>
    e.status === 'unverified' ||
    e.status === 'emergency_pending' ||
    e.status === 'pending' ||
    e.status === 'accepted' ||
    e.status === 'en_route' ||
    e.status === 'on_scene'
  )
)

const handledEmergencies = computed(() =>
  incidents.value.filter((e) =>
    e.status === 'resolved' ||
    e.status === 'cancelled'
  )
)

function markerGroup(status) {
  if (
    status === 'unverified' ||
    status === 'emergency_pending' ||
    status === 'pending' ||
    status === 'accepted' ||
    status === 'en_route' ||
    status === 'on_scene'
  ) return 'active'
  if (status === 'resolved') return 'resolved'
  if (status === 'cancelled') return 'cancelled'
  return 'muted'
}

// =========================================================================
// MAP
// =========================================================================
const mapContainer = ref(null)
let map = null
const markers = new Map()

const selectedId = ref(null)
const showDetail = ref(false)

const showStylePicker = ref(false)
const currentStyleKey = ref(
  localStorage.getItem(STORAGE_KEY) || DEFAULT_STYLE_KEY
)

function currentStyleOption() {
  return (
    STYLE_OPTIONS.find((o) => o.key === currentStyleKey.value) ||
    STYLE_OPTIONS[0]
  )
}

function initMap() {
  if (!mapContainer.value) {
    console.warn('[EmergenciesTab] map container not in DOM yet')
    return
  }
  if (map) return

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: currentStyleOption().style,
    center: CALAPAN_CENTER,
    zoom: DEFAULT_ZOOM,
    pitchWithRotate: false,
    dragRotate: false,
    touchZoomRotate: true,
    attributionControl: false,
  })

  map.addControl(
    new maplibregl.NavigationControl({ showCompass: false, showZoom: true }),
    'bottom-right'
  )

  map.on('load', () => {
    renderMarkers()
  })

  map.on('error', (e) => {
    if (e?.error?.message && !e.error.message.includes('tile')) {
      console.error('[EmergenciesTab] MapLibre error:', e)
    }
  })
}

function renderMarkers() {
  if (!map) return

  const currentIds = new Set(incidents.value.map((i) => i.id))

  for (const [id, m] of markers.entries()) {
    if (!currentIds.has(id)) {
      m.remove()
      markers.delete(id)
    }
  }

  for (const inc of incidents.value) {
    const loc = inc.location
    if (!loc) continue

    const lat = Number(loc.latitude ?? loc.lat)
    const lng = Number(loc.longitude ?? loc.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (lat === 0 && lng === 0) continue

    const group = markerGroup(inc.status)
    const isSelected = inc.id === selectedId.value

    let m = markers.get(inc.id)

    if (m) {
      const cur = m.getLngLat()
      if (cur.lng !== lng || cur.lat !== lat) {
        m.setLngLat([lng, lat])
      }
      const el = m.getElement()
      const wanted =
        `em-marker em-marker--${group}` + (isSelected ? ' em-marker--selected' : '')
      if (el.className !== wanted) el.className = wanted
    } else {
      const el = createMarkerElement(group, inc.type)

      const id = inc.id
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        const latest = incidents.value.find((i) => i.id === id)
        if (latest) openDetail(latest)
      })

      m = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
      })
        .setLngLat([lng, lat])
        .addTo(map)

      markers.set(inc.id, m)
    }
  }
}

function createMarkerElement(group, type) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `em-marker em-marker--${group}`
  el.setAttribute('aria-label', 'Emergency incident')

  let icon = '🚨'
  if (group === 'resolved') icon = '✓'
  else if (group === 'cancelled') icon = '✕'
  else if (type === 'emergency') icon = '🚨'

  el.innerHTML = `
    <span class="em-marker__pulse" aria-hidden="true"></span>
    <span class="em-marker__icon" aria-hidden="true">${icon}</span>
    <span class="em-marker__tail" aria-hidden="true"></span>
  `
  return el
}

watch(incidents, () => {
  if (map?.loaded()) renderMarkers()
})

// =========================================================================
// STYLE SWITCHING
// =========================================================================
function openStylePicker() {
  showStylePicker.value = true
}

function changeStyle(key) {
  if (!map) return
  const option = STYLE_OPTIONS.find((o) => o.key === key)
  if (!option) return

  currentStyleKey.value = key
  localStorage.setItem(STORAGE_KEY, key)
  map.setStyle(option.style)

  // setStyle() wipes DOM markers on some MapLibre versions — re-add.
  map.once('styledata', () => {
    for (const m of markers.values()) m.remove()
    markers.clear()
    renderMarkers()
  })

  showStylePicker.value = false
}

// =========================================================================
// NAVIGATION
// =========================================================================
function flyTo(incident) {
  if (!map || !incident?.location) return
  map.flyTo({
    center: [incident.location.longitude, incident.location.latitude],
    zoom: 17,
    duration: 700,
    essential: true,
  })
}

function recenterAll() {
  if (!map) return

  const withLoc = incidents.value.filter(
    (i) =>
      i.location &&
      Number.isFinite(i.location.latitude) &&
      Number.isFinite(i.location.longitude)
  )

  if (!withLoc.length) {
    map.flyTo({ center: CALAPAN_CENTER, zoom: DEFAULT_ZOOM, duration: 700 })
    return
  }

  if (withLoc.length === 1) {
    flyTo(withLoc[0])
    return
  }

  const bounds = new maplibregl.LngLatBounds()
  withLoc.forEach((i) =>
    bounds.extend([i.location.longitude, i.location.latitude])
  )
  map.fitBounds(bounds, { padding: 60, duration: 700, maxZoom: 16 })
}

// =========================================================================
// DETAIL SHEET
// =========================================================================
const detailIncident = computed(
  () => incidents.value.find((i) => i.id === selectedId.value) || null
)

const detailBarangay = ref('')
const detailBarangayOpen = ref(false)
const detailBarangayQuery = ref('')
const barangayChanged = ref(false)
const dispatching = ref(false)
const actionError = ref('')

const filteredBarangays = computed(() => searchBarangays(detailBarangayQuery.value))

function openDetail(incident) {
  selectedId.value = incident.id
  detailBarangay.value = incident.barangay || ''
  detailBarangayQuery.value = ''
  detailBarangayOpen.value = false
  barangayChanged.value = false
  actionError.value = ''
  showDetail.value = true
  flyTo(incident)
  renderMarkers()
}

function closeDetail() {
  showDetail.value = false
  selectedId.value = null
  actionError.value = ''
  renderMarkers()
}

function pickBarangay(name) {
  detailBarangay.value = name
  detailBarangayOpen.value = false
  detailBarangayQuery.value = ''
  barangayChanged.value = true
}

const canDispatch = computed(() => {
  const inc = detailIncident.value
  if (!inc) return false
  if (inc.status !== 'unverified' && inc.status !== 'emergency_pending') return false
  return !!detailBarangay.value && !dispatching.value
})

async function dispatch() {
  const inc = detailIncident.value
  if (!inc || !canDispatch.value) return

  dispatching.value = true
  actionError.value = ''

  try {
    if (barangayChanged.value && detailBarangay.value !== inc.barangay) {
      await updateDoc(doc(db, 'incidents', inc.id), {
        barangay: detailBarangay.value,
        updatedAt: serverTimestamp(),
      })
    }

    const resp = await fetch(`${API_URL}/dispatch-incident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incident_id: inc.id }),
    })
    const data = await resp.json()

    if (!resp.ok || !data.ok) {
      actionError.value = data.message || 'Dispatch failed. Try again.'
      return
    }

    closeDetail()
  } catch (e) {
    console.error('[EmergenciesTab] dispatch failed', e)
    actionError.value = 'Could not reach server. Try again.'
  } finally {
    dispatching.value = false
  }
}

async function dismiss() {
  const inc = detailIncident.value
  if (!inc) return
  if (!confirm('Mark this as a false alarm and cancel it?')) return

  try {
    await updateDoc(doc(db, 'incidents', inc.id), {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      cancelledReason: 'false_alarm',
      updatedAt: serverTimestamp(),
    })
    closeDetail()
  } catch (e) {
    actionError.value = 'Could not cancel. Try again.'
  }
}

// =========================================================================
// LIFECYCLE
// =========================================================================
onMounted(async () => {
  await nextTick()
  initMap()
  subscribe()
})

onBeforeUnmount(() => {
  if (unsub) unsub()
  for (const m of markers.values()) m.remove()
  markers.clear()
  if (map) { map.remove(); map = null }
})

// =========================================================================
// HELPERS
// =========================================================================
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

function formatDateTime(date) {
  if (!date) return '—'
  return date.toLocaleString('en-PH', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function openInMaps(loc) {
  if (!loc?.latitude || !loc?.longitude) return
  window.open(
    `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`,
    '_blank', 'noopener'
  )
}

function statusLabel(s) {
  return {
    unverified: 'Awaiting review',
    emergency_pending: 'Awaiting dispatch',
    pending: 'Dispatched',
    accepted: 'Responder en route',
    en_route: 'Responder en route',
    on_scene: 'On scene',
    resolved: 'Resolved',
    cancelled: 'Cancelled',
  }[s] || s
}
</script>

<template>
  <section class="emergencies-tab">
    <header class="head">
      <div>
        <h1 class="h1">Emergencies</h1>
        <p class="muted">
          Anonymous SOS reports. Review, verify location, dispatch responders.
        </p>
      </div>
      <div
        class="live-badge"
        :class="{ 'live-badge--active': activeEmergencies.length > 0 }"
      >
        <span class="live-dot" aria-hidden="true" />
        <span>{{ activeEmergencies.length }} active</span>
      </div>
    </header>

    <!-- ============================================================
         MAP — always rendered so initMap() has a container at mount.
         ============================================================ -->
    <div class="map-wrap">
      <div ref="mapContainer" class="map-canvas" />

      <div class="map-legend">
        <div class="legend-item">
          <span class="legend-dot legend-dot--active" />
          <span>Active</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot legend-dot--resolved" />
          <span>Resolved</span>
        </div>
        <div class="legend-item">
          <span class="legend-dot legend-dot--cancelled" />
          <span>Cancelled</span>
        </div>
      </div>

      <!-- Top-right control column -->
      <div class="map-controls">
        <button
          class="map-ctrl-btn"
          :class="{ 'map-ctrl-btn--active': showStylePicker }"
          aria-label="Change map style"
          @click="openStylePicker"
        >
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
            <path
              d="M12 2 2 7l10 5 10-5-10-5Z"
              stroke="currentColor"
              stroke-width="2"
              stroke-linejoin="round"
            />
            <path
              d="m2 12 10 5 10-5M2 17l10 5 10-5"
              stroke="currentColor"
              stroke-width="2"
              stroke-linejoin="round"
            />
          </svg>
        </button>

        <button
          class="map-ctrl-btn"
          aria-label="Fit to all"
          @click="recenterAll"
        >
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
            <path
              d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <div v-if="!loading && !incidents.length" class="map-empty">
        <p class="tiny">No emergencies on the map.</p>
      </div>
    </div>

    <!-- ============================================================
         BELOW-MAP STATE
         ============================================================ -->
    <div v-if="loading" class="state-block">
      <div class="state-spinner" aria-hidden="true" />
      <p class="tiny">Loading emergencies…</p>
    </div>

    <div v-else-if="error" class="state-block state-block--error">
      <p class="tiny">{{ error }}</p>
    </div>

    <template v-else>
      <section v-if="activeEmergencies.length" class="section">
        <h2 class="section-title">
          <span class="dot dot--red" /> Active
        </h2>
        <ul class="list">
          <li
            v-for="inc in activeEmergencies"
            :key="inc.id"
            class="card card--active"
            :class="{ 'card--selected': inc.id === selectedId }"
            @click="openDetail(inc)"
          >
            <div class="card-head">
              <div class="card-title-wrap">
                <span class="sos-badge">SOS</span>
                <span class="card-title">Anonymous emergency</span>
              </div>
              <span class="card-time">{{ timeAgo(inc.createdAt) }}</span>
            </div>

            <div v-if="inc.audioUrl" class="mini-audio">
              <span aria-hidden="true">🎤</span>
              <span class="tiny">Voice message attached</span>
            </div>

            <div class="card-summary">
              <span class="chip">{{ inc.barangay || '—' }}</span>
              <span class="chip chip--status">{{ statusLabel(inc.status) }}</span>
              <span class="chip chip--mono">
                {{ inc.shortId || inc.id.slice(0, 6).toUpperCase() }}
              </span>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="handledEmergencies.length" class="section">
        <h2 class="section-title">
          <span class="dot dot--green" /> Handled
        </h2>
        <ul class="list">
          <li
            v-for="inc in handledEmergencies"
            :key="inc.id"
            class="card card--handled"
            @click="openDetail(inc)"
          >
            <div class="card-head">
              <div class="card-title-wrap">
                <span class="ok-badge">✓</span>
                <span class="card-title">Anonymous emergency</span>
              </div>
              <span class="card-time">{{ formatDateTime(inc.createdAt) }}</span>
            </div>
            <div class="card-summary">
              <span class="chip">{{ inc.barangay || '—' }}</span>
              <span class="chip chip--mono">
                {{ inc.shortId || inc.id.slice(0, 6).toUpperCase() }}
              </span>
            </div>
          </li>
        </ul>
      </section>
    </template>

    <!-- ============================================================
         STYLE PICKER OVERLAY
         ============================================================ -->
    <Transition name="fade">
      <div
        v-if="showStylePicker"
        class="picker-overlay"
        @click="showStylePicker = false"
      >
        <div class="picker-card" @click.stop>
          <p class="picker-title">Map style</p>
          <button
            v-for="opt in STYLE_OPTIONS"
            :key="opt.key"
            type="button"
            class="style-option"
            :class="{ 'style-option--on': currentStyleKey === opt.key }"
            @click="changeStyle(opt.key)"
          >
            <span
              class="style-preview"
              :style="{ background: opt.preview }"
              aria-hidden="true"
            />
            <span class="style-body">
              <span class="style-label">{{ opt.label }}</span>
              <span class="style-hint">{{ opt.hint }}</span>
            </span>
            <span
              v-if="currentStyleKey === opt.key"
              class="style-check"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </Transition>

    <!-- ============================================================
         DETAIL SHEET
         ============================================================ -->
    <Transition name="fade">
      <div
        v-if="showDetail && detailIncident"
        class="sheet-root"
        @click.self="closeDetail"
      >
        <div class="sheet-backdrop" @click="closeDetail" />
        <div class="sheet">
          <div class="sheet-grabber" />

          <header class="sheet-head">
            <div class="sheet-head-text">
              <div class="sheet-badges">
                <span class="sos-badge">SOS</span>
                <span class="sheet-status">{{ statusLabel(detailIncident.status) }}</span>
              </div>
              <h2 class="sheet-title">
                {{ detailIncident.barangay || 'Unknown location' }}
              </h2>
              <p class="tiny">
                Ref {{ detailIncident.shortId || detailIncident.id.slice(0, 6).toUpperCase() }}
                · {{ timeAgo(detailIncident.createdAt) }}
              </p>
            </div>
            <button class="sheet-close" aria-label="Close" @click="closeDetail">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor"
                      stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </header>

          <div class="sheet-body">
            <div v-if="detailIncident.audioUrl" class="audio-block">
              <div class="audio-head">
                <span class="audio-icon" aria-hidden="true">🎤</span>
                <div>
                  <p class="audio-label">Voice message</p>
                  <p class="tiny">
                    {{ detailIncident.audioDurationSeconds
                        ? `${detailIncident.audioDurationSeconds} seconds`
                        : 'Recorded' }}
                  </p>
                </div>
              </div>
              <audio
                :src="detailIncident.audioUrl"
                controls
                class="audio-player"
                preload="metadata"
              />
            </div>
            <div v-else class="no-audio">
              <span aria-hidden="true">🔇</span>
              <span class="tiny">No voice message recorded</span>
            </div>

            <div class="location-block">
              <p class="sheet-section-label">Precise location</p>
              <p v-if="detailIncident.location" class="coords">
                {{ detailIncident.location.latitude.toFixed(6) }},
                {{ detailIncident.location.longitude.toFixed(6) }}
              </p>
              <p v-else class="tiny">No coordinates available.</p>
              <button
                v-if="detailIncident.location"
                class="btn btn--ghost location-btn"
                @click="openInMaps(detailIncident.location)"
              >
                📍 Open in Google Maps
              </button>
            </div>

            <div class="barangay-block">
              <p class="sheet-section-label">Assign to barangay</p>

              <div v-if="!detailBarangayOpen" class="barangay-current">
                <span class="barangay-chip">
                  📍 {{ detailBarangay || 'Not set' }}
                  <button
                    class="barangay-edit"
                    type="button"
                    @click="detailBarangayOpen = true"
                  >Change</button>
                </span>
                <p
                  v-if="detailIncident.suggestedBarangay &&
                        detailIncident.suggestedBarangay === detailBarangay &&
                        !barangayChanged"
                  class="tiny suggested-note"
                >
                  Auto-detected from GPS
                </p>
                <p v-else-if="barangayChanged" class="tiny override-note">
                  Manually overridden
                </p>
              </div>

              <div v-else class="barangay-picker">
                <input
                  v-model="detailBarangayQuery"
                  class="input"
                  placeholder="Search barangay…"
                />
                <ul v-if="detailBarangayQuery && filteredBarangays.length" class="barangay-list">
                  <li
                    v-for="b in filteredBarangays.slice(0, 8)"
                    :key="b"
                    class="barangay-item"
                    @click="pickBarangay(b)"
                  >{{ b }}</li>
                </ul>
                <button
                  class="link"
                  @click="detailBarangayOpen = false; detailBarangayQuery = ''"
                >
                  Cancel
                </button>
              </div>
            </div>

            <p v-if="actionError" class="error-banner">{{ actionError }}</p>
          </div>

          <footer class="sheet-foot">
            <template
              v-if="detailIncident.status === 'unverified' ||
                    detailIncident.status === 'emergency_pending'"
            >
              <button
                class="btn btn--ghost"
                :disabled="dispatching"
                @click="dismiss"
              >
                Dismiss
              </button>
              <button
                class="btn btn--danger"
                :disabled="!canDispatch"
                @click="dispatch"
              >
                {{ dispatching ? 'Dispatching…' : 'Dispatch Responder' }}
              </button>
            </template>
            <template v-else>
              <button class="btn btn--primary" @click="closeDetail">Close</button>
            </template>
          </footer>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.emergencies-tab { display: flex; flex-direction: column; padding-bottom: 20px; }

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.head .h1 { font-size: 1.5rem; }
.head .muted { margin-top: 4px; line-height: 1.5; }

.live-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 6px 12px;
  border-radius: 99px;
  background: rgba(10, 22, 40, 0.72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border-strong);
  color: var(--text-muted);
  flex-shrink: 0;
}
.live-badge--active {
  background: rgba(230, 57, 70, 0.16);
  border-color: rgba(230, 57, 70, 0.4);
  color: #e63946;
}
.live-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px currentColor;
  opacity: 0.4;
}

/* ---------- Map ---------- */
.map-wrap {
  position: relative;
  width: 100%;
  height: 380px;
  border-radius: var(--radius, 14px);
  overflow: hidden;
  border: 1px solid var(--glass-border-strong);
  margin-bottom: 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  background: rgba(10, 22, 40, 0.5);
}
.map-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }

.map-legend {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(10, 22, 40, 0.72);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid var(--glass-border-strong);
  border-radius: 12px;
  font-size: 0.6875rem;
  font-weight: 650;
  color: var(--text);
  z-index: 3;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.legend-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.legend-dot--active {
  background: #e63946;
  box-shadow: 0 0 0 4px rgba(230, 57, 70, 0.3);
}
.legend-dot--resolved { background: #2f9e73; }
.legend-dot--cancelled { background: #64748b; }

/* Top-right control column */
.map-controls {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 3;
}
.map-ctrl-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(10, 22, 40, 0.72);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid var(--glass-border-strong);
  color: var(--text);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}
.map-ctrl-btn:active { transform: scale(0.92); }
.map-ctrl-btn--active {
  color: var(--primary-light);
  border-color: var(--primary-light);
}

.map-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(2px);
  pointer-events: none;
  z-index: 2;
  color: #eaf0fa;
}

/* ---------- Style picker ---------- */
.picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(3px);
}
.picker-card {
  width: 100%;
  max-width: 320px;
  background: linear-gradient(
    160deg,
    rgba(20, 41, 67, 0.98) 0%,
    rgba(10, 22, 40, 0.98) 100%
  );
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  border: 1px solid var(--glass-border-strong);
  border-radius: var(--radius-lg);
  padding: 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  animation: pop 0.2s ease;
}
@keyframes pop {
  from { transform: scale(0.94); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}
.picker-title {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 10px;
  padding-left: 4px;
}
.style-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 12px;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}
.style-option + .style-option { margin-top: 4px; }
.style-option:active { transform: scale(0.98); }
.style-option--on {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--glass-border-strong);
}
.style-preview {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  flex-shrink: 0;
  border: 1px solid var(--glass-border);
}
.style-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.style-label {
  font-size: 0.9375rem;
  font-weight: 700;
  line-height: 1.2;
}
.style-hint {
  font-size: 0.6875rem;
  color: var(--text-muted);
  margin-top: 2px;
}
.style-check {
  color: var(--accent-light);
  flex-shrink: 0;
  display: grid;
  place-items: center;
}

/* ---------- Sections ---------- */
.section { margin-bottom: 22px; }
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 12px;
}
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot--red {
  background: #e63946;
  animation: dot-pulse 1.6s ease-in-out infinite alternate;
}
.dot--green { background: #2f9e73; }
@keyframes dot-pulse {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0.4; transform: scale(0.8); }
}

.list { list-style: none; display: flex; flex-direction: column; gap: 10px; }

.card {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.06) 0%,
    rgba(255, 255, 255, 0.02) 100%
  );
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
.card:active { transform: scale(0.99); }
.card--active {
  border-color: rgba(230, 57, 70, 0.5);
  background:
    radial-gradient(90% 100% at 0% 0%, rgba(230, 57, 70, 0.12) 0%, transparent 70%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%);
  animation: card-alert 2s ease-in-out infinite alternate;
}
.card--selected {
  border-color: #e63946;
  box-shadow: 0 0 0 2px rgba(230, 57, 70, 0.4);
}
.card--handled { opacity: 0.7; }
@keyframes card-alert {
  from { box-shadow: 0 0 0 0 rgba(230, 57, 70, 0.3); }
  to   { box-shadow: 0 0 20px 2px rgba(230, 57, 70, 0.4); }
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.card-title-wrap { display: flex; align-items: center; gap: 8px; min-width: 0; }
.card-title { font-size: 0.9375rem; font-weight: 700; color: var(--text); }
.card-time {
  font-size: 0.75rem;
  color: var(--text-muted);
  flex-shrink: 0;
  white-space: nowrap;
}

.sos-badge {
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

.ok-badge {
  display: grid;
  place-items: center;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: #2f9e73;
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

.mini-audio {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 99px;
  background: rgba(14, 165, 233, 0.14);
  border: 1px solid rgba(14, 165, 233, 0.32);
  color: #38bdf8;
  font-size: 0.75rem;
  font-weight: 650;
  margin-bottom: 10px;
}

.card-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-muted);
  border: 1px solid var(--glass-border);
}
.chip--status { color: #f59e0b; border-color: rgba(245, 158, 11, 0.3); }
.chip--mono {
  font-family: ui-monospace, monospace;
  letter-spacing: 0.04em;
  color: var(--text);
}

/* ---------- Sheet ---------- */
.sheet-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.sheet-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
}
.sheet {
  position: relative;
  background: linear-gradient(
    180deg,
    rgba(20, 41, 67, 0.98) 0%,
    rgba(10, 22, 40, 0.98) 100%
  );
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  border-top-left-radius: 22px;
  border-top-right-radius: 22px;
  border: 1px solid var(--glass-border-strong);
  border-bottom: none;
  max-height: 92dvh;
  display: flex;
  flex-direction: column;
  animation: sheet-up 0.24s ease;
}
@keyframes sheet-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
.sheet-grabber {
  width: 40px; height: 4px;
  background: rgba(255, 255, 255, 0.14);
  border-radius: 99px;
  margin: 8px auto 4px;
}
.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 20px 14px;
  border-bottom: 1px solid var(--glass-border);
}
.sheet-head-text { min-width: 0; }
.sheet-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.sheet-status {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #f59e0b;
}
.sheet-title { font-size: 1.125rem; font-weight: 750; margin-bottom: 4px; }
.sheet-close {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--glass-border);
  display: grid;
  place-items: center;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}
.sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px;
}
.audio-block {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 16px;
}
.audio-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.audio-icon { font-size: 1.25rem; }
.audio-label { font-size: 0.8125rem; font-weight: 700; }
.audio-player { width: 100%; height: 40px; }

.no-audio {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  margin-bottom: 16px;
  color: var(--text-muted);
}

.location-block,
.barangay-block {
  padding: 14px 0;
  border-top: 1px solid var(--glass-border);
}
.sheet-section-label {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 8px;
}
.coords {
  font-family: ui-monospace, monospace;
  font-size: 0.8125rem;
  color: var(--text);
  margin-bottom: 10px;
  letter-spacing: 0.02em;
}
.location-btn { width: 100%; }

.barangay-current { display: flex; flex-direction: column; gap: 6px; }
.barangay-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(14, 165, 233, 0.14);
  border: 1px solid rgba(14, 165, 233, 0.5);
  border-radius: 99px;
  color: #38bdf8;
  font-size: 0.9375rem;
  font-weight: 700;
  align-self: flex-start;
  max-width: 100%;
}
.barangay-edit {
  margin-left: 6px;
  padding: 3px 9px;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(14, 165, 233, 0.22);
  border: none;
  border-radius: 6px;
  color: #38bdf8;
  cursor: pointer;
}
.suggested-note { color: #2f9e73; }
.override-note { color: #f59e0b; }

.barangay-picker { position: relative; }
.barangay-list {
  position: absolute;
  top: 100%;
  left: 0; right: 0;
  margin-top: 4px;
  max-height: 220px;
  overflow-y: auto;
  background: linear-gradient(
    160deg,
    rgba(20, 41, 67, 0.98) 0%,
    rgba(10, 22, 40, 0.98) 100%
  );
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border-strong);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  list-style: none;
  padding: 4px;
  z-index: 10;
}
.barangay-item {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.9375rem;
  cursor: pointer;
}
.barangay-item:hover,
.barangay-item:active { background: rgba(255, 255, 255, 0.06); }

.link {
  background: none;
  border: none;
  color: #38bdf8;
  text-decoration: underline;
  padding: 8px 0 0;
  font-size: 0.75rem;
  cursor: pointer;
}

.error-banner {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 0.8125rem;
  color: #ef4444;
  margin-top: 12px;
}

.sheet-foot {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--glass-border);
}
.sheet-foot .btn { flex: 1; }
.sheet-foot .btn--ghost { flex: 0.5; }

.btn--danger {
  background: linear-gradient(160deg, #ff4d5e 0%, #e63946 55%, #b81f2b 100%);
  color: #fff;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(230, 57, 70, 0.4);
}
.btn--danger:active:not(:disabled) { transform: scale(0.97); }
.btn--danger:disabled { opacity: 0.5; cursor: not-allowed; }

.state-block {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.05) 0%,
    rgba(255, 255, 255, 0.02) 100%
  );
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px dashed var(--glass-border-strong);
  border-radius: var(--radius);
  padding: 40px 24px;
  text-align: center;
}
.state-spinner {
  width: 28px; height: 28px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #e63946;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.state-icon { font-size: 2rem; margin-bottom: 10px; opacity: 0.8; }
.state-title { font-size: 0.9375rem; font-weight: 650; margin-bottom: 4px; }
.state-text { line-height: 1.5; max-width: 30ch; margin-inline: auto; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (min-width: 640px) {
  .head .h1 { font-size: 1.75rem; }
  .map-wrap { height: 460px; }
  .sheet-root { justify-content: center; align-items: center; padding: 24px; }
  .sheet {
    border-radius: 20px;
    border-bottom: 1px solid var(--glass-border-strong);
    width: 100%;
    max-width: 560px;
    max-height: 88dvh;
  }
  .sheet-grabber { display: none; }
  .sheet-head { padding: 20px 24px 16px; }
  .sheet-body { padding: 20px 24px; }
  .sheet-foot { padding: 16px 24px; }
}

@media (min-width: 1024px) {
  .head .h1 { font-size: 2rem; }
  .head .muted { font-size: 1rem; }
  .map-wrap { height: 520px; }
}
</style>

<!-- ============================================================
     GLOBAL STYLES (unscoped) — MapLibre DOM lives outside scoped
     ============================================================ -->
<style>
.em-marker {
  position: absolute;
  top: 0;
  left: 0;
  width: 40px;
  height: 52px;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  display: block;
  -webkit-tap-highlight-color: transparent;
  outline: none;
}

.em-marker--active    { --pin: #e63946; --pin-dark: #b81f2b; }
.em-marker--resolved  { --pin: #2f9e73; --pin-dark: #1e6b4d; }
.em-marker--cancelled { --pin: #64748b; --pin-dark: #3f4c5e; }
.em-marker--muted     { --pin: #64748b; --pin-dark: #3f4c5e; }

.em-marker__pulse {
  position: absolute;
  top: 0;
  left: 50%;
  width: 40px;
  height: 40px;
  margin-left: -20px;
  border-radius: 50%;
  background: transparent;
  z-index: 1;
  pointer-events: none;
  animation: em-pulse 1.8s ease-out infinite;
}

@keyframes em-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(230, 57, 70, 0.65);
  }
  70% {
    box-shadow: 0 0 0 20px rgba(230, 57, 70, 0);
  }
  100% {
    box-shadow: 0 0 0 20px rgba(230, 57, 70, 0);
  }
}

.em-marker__icon {
  position: absolute;
  top: 0;
  left: 50%;
  width: 40px;
  height: 40px;
  margin-left: -20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 1.125rem;
  line-height: 1;
  color: #fff;
  background: linear-gradient(160deg, var(--pin), var(--pin-dark));
  border: 3px solid #fff;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.45);
  z-index: 2;
  transform-origin: center;
  transition: transform 0.12s ease;
}
.em-marker:active .em-marker__icon {
  transform: scale(0.92);
}

.em-marker__tail {
  position: absolute;
  top: 34px;
  left: 50%;
  margin-left: -8px;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 18px solid var(--pin);
  z-index: 0;
  pointer-events: none;
  filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.35));
}

.em-marker--resolved .em-marker__pulse,
.em-marker--cancelled .em-marker__pulse,
.em-marker--muted .em-marker__pulse {
  animation: none;
  display: none;
}

.em-marker--selected .em-marker__icon {
  transform: scale(1.15);
  border-width: 4px;
  box-shadow: 0 4px 20px rgba(230, 57, 70, 0.9),
              0 0 0 2px rgba(255, 255, 255, 0.4);
}

.em-marker:focus-visible .em-marker__icon {
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.6),
              0 4px 10px rgba(0, 0, 0, 0.4);
}

.maplibregl-ctrl-group {
  background: rgba(10, 22, 40, 0.72) !important;
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  border-radius: 12px !important;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
}
.maplibregl-ctrl-group button {
  background: transparent !important;
  color: var(--text) !important;
  width: 40px !important;
  height: 40px !important;
  min-width: 40px !important;
  min-height: 40px !important;
  font-size: 20px !important;
}
.maplibregl-ctrl-group button + button {
  border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
}
.maplibregl-ctrl-bottom-right {
  bottom: 12px !important;
  right: 12px !important;
}
</style>