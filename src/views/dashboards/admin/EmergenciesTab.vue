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

// NOTE: maplibre-gl v3+ bundles its own worker — no setWorkerUrl needed.
// The old worker import was removed because the path no longer exists in
// v3+, and the bad asset request was falling through to the SPA fallback
// (returning index.html with MIME text/html), which killed the bundle.

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const CALAPAN_CENTER = [121.1803, 13.4108]
const DEFAULT_ZOOM = 13

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

const mapContainer = ref(null)
let map = null
const markers = new Map()
const selectedId = ref(null)
const showDetail = ref(false)

// Active = needs attention. Since emergencies now come in as 'unverified'
// (so they also appear in Verify), we include that status here too.
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
    e.status === 'cancelled' ||
    ((e.acknowledgedAt || e.acceptedAt) && e.status === 'resolved')
  )
)

function initMap() {
  if (!mapContainer.value) return
  map = new maplibregl.Map({
    container: mapContainer.value,
    style: SATELLITE_STYLE,
    center: CALAPAN_CENTER,
    zoom: DEFAULT_ZOOM,
    pitchWithRotate: false,
    dragRotate: false,
    attributionControl: false,
  })
  map.addControl(
    new maplibregl.NavigationControl({ showCompass: false, showZoom: true }),
    'bottom-right'
  )
  map.on('load', () => renderMarkers())
}

function renderMarkers() {
  if (!map) return
  const currentIds = new Set(activeEmergencies.value.map((i) => i.id))

  for (const [id, m] of markers.entries()) {
    if (!currentIds.has(id)) {
      m.remove()
      markers.delete(id)
    }
  }

  for (const inc of activeEmergencies.value) {
    if (!inc.location) continue
    const lng = inc.location.longitude
    const lat = inc.location.latitude
    const isSelected = inc.id === selectedId.value

    let m = markers.get(inc.id)
    if (m) {
      const cur = m.getLngLat()
      if (cur.lng !== lng || cur.lat !== lat) {
        m.setLngLat([lng, lat])
      }
      const el = m.getElement()
      el.classList.toggle('em-marker--selected', isSelected)
    } else {
      const el = document.createElement('button')
      el.className = 'em-marker'
      el.type = 'button'
      el.setAttribute('aria-label', 'Emergency')
      el.innerHTML = `
        <span class="em-marker__pulse"></span>
        <span class="em-marker__icon">🚨</span>
      `
      el.addEventListener('click', () => openDetail(inc))
      m = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map)
      markers.set(inc.id, m)
    }
  }
}

watch(activeEmergencies, () => {
  if (map?.loaded()) renderMarkers()
})

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
  const active = activeEmergencies.value.filter((i) => i.location)
  if (!active.length) {
    map.flyTo({ center: CALAPAN_CENTER, zoom: DEFAULT_ZOOM, duration: 700 })
    return
  }
  if (active.length === 1) {
    flyTo(active[0])
    return
  }
  const bounds = new maplibregl.LngLatBounds()
  active.forEach((i) => bounds.extend([i.location.longitude, i.location.latitude]))
  map.fitBounds(bounds, { padding: 60, duration: 700, maxZoom: 16 })
}

const detailIncident = computed(() =>
  incidents.value.find((i) => i.id === selectedId.value) || null
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

onMounted(subscribe)

onMounted(async () => {
  await nextTick()
  initMap()
})

onBeforeUnmount(() => {
  if (unsub) unsub()
  if (map) { map.remove(); map = null }
})

function timeAgo(date) {
  if (!date) return ''
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
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
      <div class="live-badge" :class="{ 'live-badge--active': activeEmergencies.length > 0 }">
        <span class="live-dot" aria-hidden="true" />
        <span>{{ activeEmergencies.length }} active</span>
      </div>
    </header>

    <div v-if="loading" class="state-block">
      <div class="state-spinner" aria-hidden="true" />
      <p class="tiny">Loading emergencies…</p>
    </div>

    <div v-else-if="error" class="state-block state-block--error">
      <p class="tiny">{{ error }}</p>
    </div>

    <template v-else>
      <div class="map-wrap">
        <div ref="mapContainer" class="map-canvas" />
        <div class="map-legend">
          <span class="legend-dot" aria-hidden="true" />
          <span>Active emergency</span>
        </div>
        <button class="recenter-btn" aria-label="Fit to all" @click="recenterAll">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
            <path d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <div v-if="!activeEmergencies.length" class="map-empty">
          <p class="tiny">No active emergencies on the map.</p>
        </div>
      </div>

      <div v-if="!incidents.length" class="state-block" style="margin-top:16px">
        <div class="state-icon" aria-hidden="true">✓</div>
        <p class="state-title">No emergencies yet</p>
        <p class="tiny state-text">
          Anonymous SOS reports will appear here instantly.
        </p>
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
    </template>

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
                <button class="link" @click="detailBarangayOpen = false; detailBarangayQuery = ''">
                  Cancel
                </button>
              </div>
            </div>

            <p v-if="actionError" class="error-banner">{{ actionError }}</p>
          </div>

          <footer class="sheet-foot">
            <template v-if="detailIncident.status === 'unverified' || detailIncident.status === 'emergency_pending'">
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
  background: var(--bg-input, #0f1729);
  border: 1px solid var(--border, #22304a);
  color: var(--text-muted, #93a3bd);
  flex-shrink: 0;
}
.live-badge--active {
  background: rgba(230, 57, 70, 0.14);
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

.map-wrap {
  position: relative;
  width: 100%;
  height: 340px;
  border-radius: var(--radius, 14px);
  overflow: hidden;
  border: 1px solid var(--border, #22304a);
  margin-bottom: 20px;
}
.map-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }

.map-legend {
  position: absolute;
  top: 12px;
  left: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(18, 28, 46, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border, #22304a);
  border-radius: 99px;
  font-size: 0.75rem;
  font-weight: 650;
  color: var(--text, #eaf0fa);
  z-index: 3;
  pointer-events: none;
}
.legend-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #e63946;
  box-shadow: 0 0 0 4px rgba(230, 57, 70, 0.3);
}

.recenter-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 40px; height: 40px;
  border-radius: 10px;
  background: rgba(18, 28, 46, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border, #22304a);
  color: var(--text, #eaf0fa);
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 3;
  transition: transform 0.15s ease;
}
.recenter-btn:active { transform: scale(0.92); }

.map-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
  pointer-events: none;
  z-index: 2;
  color: #eaf0fa;
}

.section { margin-bottom: 22px; }
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted, #93a3bd);
  margin-bottom: 12px;
}
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot--red { background: #e63946; animation: dot-pulse 1.6s ease-in-out infinite alternate; }
.dot--green { background: #2f9e73; }
@keyframes dot-pulse {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0.4; transform: scale(0.8); }
}

.list { list-style: none; display: flex; flex-direction: column; gap: 10px; }

.card {
  background: var(--bg-elev, #121c2e);
  border: 1px solid var(--border, #22304a);
  border-radius: var(--radius, 14px);
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.card:active { transform: scale(0.99); }
.card--active {
  border-color: rgba(230, 57, 70, 0.5);
  background:
    radial-gradient(90% 100% at 0% 0%, rgba(230, 57, 70, 0.10) 0%, transparent 70%),
    var(--bg-elev, #121c2e);
  animation: card-alert 2s ease-in-out infinite alternate;
}
.card--selected {
  border-color: #e63946;
  box-shadow: 0 0 0 2px rgba(230, 57, 70, 0.4);
}
.card--handled { opacity: 0.65; }
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
.card-title { font-size: 0.9375rem; font-weight: 700; color: var(--text, #eaf0fa); }
.card-time {
  font-size: 0.75rem;
  color: var(--text-muted, #93a3bd);
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
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #3b82f6;
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
  background: var(--bg-input, #0f1729);
  color: var(--text-muted, #93a3bd);
  border: 1px solid var(--border, #22304a);
}
.chip--status { color: #f59e0b; border-color: rgba(245, 158, 11, 0.3); }
.chip--mono {
  font-family: ui-monospace, monospace;
  letter-spacing: 0.04em;
  color: var(--text, #eaf0fa);
}

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
  background: var(--bg-elev, #121c2e);
  border-top-left-radius: 22px;
  border-top-right-radius: 22px;
  border: 1px solid var(--border, #22304a);
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
  background: var(--border, #22304a);
  border-radius: 99px;
  margin: 8px auto 4px;
}
.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 20px 14px;
  border-bottom: 1px solid var(--border, #22304a);
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
  background: var(--bg-input, #0f1729);
  border: none;
  display: grid;
  place-items: center;
  color: var(--text-muted, #93a3bd);
  cursor: pointer;
  flex-shrink: 0;
}
.sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px;
}
.audio-block {
  background: var(--bg-input, #0f1729);
  border: 1px solid var(--border, #22304a);
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
  background: var(--bg-input, #0f1729);
  border-radius: 10px;
  margin-bottom: 16px;
  color: var(--text-muted, #93a3bd);
}

.location-block,
.barangay-block {
  padding: 14px 0;
  border-top: 1px solid var(--border, #22304a);
}
.sheet-section-label {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted, #93a3bd);
  margin-bottom: 8px;
}
.coords {
  font-family: ui-monospace, monospace;
  font-size: 0.8125rem;
  color: var(--text, #eaf0fa);
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
  background: rgba(59, 130, 246, 0.14);
  border: 1px solid #3b82f6;
  border-radius: 99px;
  color: #3b82f6;
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
  background: rgba(59, 130, 246, 0.22);
  border: none;
  border-radius: 6px;
  color: #3b82f6;
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
  background: var(--bg-elev, #121c2e);
  border: 1px solid var(--border, #22304a);
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
.barangay-item:hover, .barangay-item:active { background: var(--bg-input, #0f1729); }

.link {
  background: none;
  border: none;
  color: #3b82f6;
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
  border-top: 1px solid var(--border, #22304a);
}
.sheet-foot .btn { flex: 1; }
.sheet-foot .btn--ghost { flex: 0.5; }

.btn--danger {
  background: linear-gradient(160deg, #ff4d5e 0%, #e63946 55%, #b81f2b 100%);
  color: #fff;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(230, 57, 70, 0.35);
}
.btn--danger:active:not(:disabled) { transform: scale(0.97); }
.btn--danger:disabled { opacity: 0.5; cursor: not-allowed; }

.state-block {
  background: var(--bg-elev, #121c2e);
  border: 1px dashed var(--border, #22304a);
  border-radius: var(--radius, 14px);
  padding: 40px 24px;
  text-align: center;
}
.state-spinner {
  width: 28px; height: 28px;
  border-radius: 50%;
  border: 3px solid var(--border, #22304a);
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
  .map-wrap { height: 420px; }
  .sheet-root { justify-content: center; align-items: center; padding: 24px; }
  .sheet {
    border-radius: 20px;
    border-bottom: 1px solid var(--border, #22304a);
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
  .map-wrap { height: 480px; }
}
</style>

<style>
/* ============================================================
   EMERGENCY MARKER — teardrop pin, tip at the coordinate
   Outer element stays transform-free so MapLibre's positioning
   transform is never fought by a CSS transition.
   ============================================================ */
.em-marker {
  position: relative;
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
  transition: none;
}

/* Soft pulse ring anchored to the circular head */
.em-marker__pulse {
  position: absolute;
  top: 0;
  left: 50%;
  width: 40px;
  height: 40px;
  margin-left: -20px;
  border-radius: 50%;
  background: #e63946;
  opacity: 0.55;
  z-index: 1;
  pointer-events: none;
  transform-origin: center;
  animation: em-pulse 1.8s ease-out infinite;
}

@keyframes em-pulse {
  0%   { transform: scale(1);   opacity: 0.55; }
  70%  { transform: scale(1.9); opacity: 0;    }
  100% { transform: scale(1.9); opacity: 0;    }
}

/* Circular head */
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
  color: #fff;
  background: linear-gradient(160deg, #ff4d5e, #e63946 55%, #b81f2b);
  border: 3px solid #fff;
  box-shadow: 0 3px 12px rgba(230, 57, 70, 0.6);
  z-index: 2;
  transform-origin: center;
  transition: transform 0.15s ease;
}
.em-marker:active .em-marker__icon {
  transform: scale(0.92);
}

/* (EmergenciesTab did not originally have a tail; keeping head-only pin.
   If you want a tail here too, add a .em-marker__tail span in the
   createMarker innerHTML and the CSS below.) */

.em-marker--selected .em-marker__icon {
  transform: scale(1.15);
  border-width: 4px;
  box-shadow: 0 4px 20px rgba(230, 57, 70, 0.9);
}

/* MapLibre controls */
.maplibregl-ctrl-group {
  background: rgba(18, 28, 46, 0.92) !important;
  backdrop-filter: blur(10px);
  border: 1px solid #22304a !important;
  border-radius: 12px !important;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
}
.maplibregl-ctrl-group button {
  background: transparent !important;
  color: #eaf0fa !important;
  width: 40px !important;
  height: 40px !important;
  min-width: 40px !important;
  min-height: 40px !important;
  font-size: 20px !important;
}
.maplibregl-ctrl-group button + button {
  border-top: 1px solid #22304a !important;
}
.maplibregl-ctrl-bottom-right { bottom: 12px !important; right: 12px !important; }
</style>