<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { useAuthStore } from '@/stores/auth'
import {
  useIncidents,
  acceptIncident,
  STATUS_GROUPS,
  statusLabel,
} from '@/composables/useIncidents'

// NOTE: maplibre-gl v3+ bundles its own worker — no setWorkerUrl needed.
// The old worker import was removed because the path no longer exists in
// v3+, and the bad asset request was falling through to the SPA fallback
// (returning index.html with MIME text/html), which killed the bundle.

// =========================================================================
// CONSTANTS
// =========================================================================
const CALAPAN_CENTER = [121.1803, 13.4108]
const DEFAULT_ZOOM = 13

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: 'satellite-layer',
      type: 'raster',
      source: 'satellite',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
}

const STYLE_OPTIONS = [
  {
    key: 'bright',
    label: 'Colorful',
    preview: 'linear-gradient(135deg, #a8d8ea 0%, #f4e4a1 50%, #b8d4a0 100%)',
    style: 'https://tiles.openfreemap.org/styles/bright',
  },
  {
    key: 'positron',
    label: 'Light',
    preview: 'linear-gradient(135deg, #f5f5f0 0%, #e8e8e0 100%)',
    style: 'https://tiles.openfreemap.org/styles/positron',
  },
  {
    key: 'satellite',
    label: 'Satellite',
    preview: 'linear-gradient(135deg, #1a3a2a 0%, #2d5a3f 50%, #4a7a5a 100%)',
    style: SATELLITE_STYLE,
  },
]

const STORAGE_KEY = 'rr:mapStyle'
const DEFAULT_STYLE_KEY = 'bright'

// =========================================================================
// STORE + DATA
// =========================================================================
const auth = useAuthStore()

// All pending incidents (unclaimed) — for the red markers
const { incidents: pendingIncidents } = useIncidents({
  statuses: STATUS_GROUPS.OPEN,
  scope: 'all',
})

// My active incidents — for the green markers
const { incidents: myIncidents } = useIncidents({
  statuses: STATUS_GROUPS.ACTIVE,
  scope: 'assignedToMe',
})

// Everything else accepted by others — for the amber markers
const { incidents: otherActiveIncidents } = useIncidents({
  statuses: STATUS_GROUPS.ACTIVE,
  scope: 'all',
})

/**
 * Combined list of incidents to render on the map.
 * Priority: mine > pending > other-active
 * Deduplicated by incident id.
 */
const mapIncidents = computed(() => {
  const seen = new Set()
  const out = []

  // Mine first (highest priority for responder)
  for (const i of myIncidents.value) {
    if (seen.has(i.id)) continue
    seen.add(i.id)
    out.push({ ...i, _group: 'mine' })
  }

  // Pending (unclaimed)
  for (const i of pendingIncidents.value) {
    if (seen.has(i.id)) continue
    seen.add(i.id)
    out.push({ ...i, _group: 'pending' })
  }

  // Others' active (still useful context)
  for (const i of otherActiveIncidents.value) {
    if (seen.has(i.id)) continue
    seen.add(i.id)
    out.push({ ...i, _group: 'other' })
  }

  return out
})

// =========================================================================
// STATE
// =========================================================================
const mapContainer = ref(null)
const map = ref(null)
const loading = ref(true)
const loadError = ref('')

const userPosition = ref(null)
const locating = ref(false)
const locationError = ref('')

const showAttrib = ref(false)
const showStylePicker = ref(false)

const selectedIncident = ref(null)
const acceptingId = ref(null)
const acceptError = ref('')

const currentStyleKey = ref(
  localStorage.getItem(STORAGE_KEY) || DEFAULT_STYLE_KEY
)

let userMarker = null
const incidentMarkers = new Map() // id → Marker

function currentStyleOption() {
  return (
    STYLE_OPTIONS.find((o) => o.key === currentStyleKey.value) ||
    STYLE_OPTIONS[0]
  )
}

// =========================================================================
// INIT
// =========================================================================
onMounted(async () => {
  await nextTick()
  initMap()

  if (map.value) {
    map.value.once('load', () => {
      requestUserLocation()
      renderIncidentMarkers()
    })
  } else {
    requestUserLocation()
  }
})

onBeforeUnmount(() => {
  if (userMarker) {
    userMarker.remove()
    userMarker = null
  }
  for (const m of incidentMarkers.values()) m.remove()
  incidentMarkers.clear()
  if (map.value) {
    map.value.remove()
    map.value = null
  }
})

function initMap() {
  try {
    map.value = new maplibregl.Map({
      container: mapContainer.value,
      style: currentStyleOption().style,
      center: CALAPAN_CENTER,
      zoom: DEFAULT_ZOOM,
      pitchWithRotate: false,
      dragRotate: false,
      touchZoomRotate: true,
      attributionControl: false,
    })

    map.value.addControl(
      new maplibregl.NavigationControl({ showCompass: false, showZoom: true }),
      'bottom-right'
    )

    map.value.on('load', () => {
      loading.value = false
    })

    map.value.on('error', (e) => {
      if (e?.error?.message && !e.error.message.includes('tile')) {
        console.error('[ResponderMapTab] MapLibre error:', e)
      }
    })
  } catch (e) {
    console.error('[ResponderMapTab] failed to init', e)
    loadError.value = 'Could not initialize the map.'
    loading.value = false
  }
}

// =========================================================================
// GEOLOCATION
// =========================================================================
function requestUserLocation() {
  if (!('geolocation' in navigator)) return
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false
      const { longitude, latitude, accuracy } = pos.coords
      userPosition.value = { lng: longitude, lat: latitude, accuracy }
      dropUserMarker(longitude, latitude)
      map.value?.flyTo({
        center: [longitude, latitude],
        zoom: Math.max(DEFAULT_ZOOM, 14),
        duration: 800,
        essential: true,
      })
    },
    () => {
      locating.value = false
      locationError.value = 'Location unavailable.'
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  )
}

function dropUserMarker(lng, lat) {
  if (!map.value) return
  if (userMarker) userMarker.remove()

  const el = document.createElement('div')
  el.className = 'user-dot'
  el.innerHTML = `<span class="user-dot__core"></span>`

  userMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat([lng, lat])
    .addTo(map.value)
}

// =========================================================================
// INCIDENT MARKERS
// =========================================================================
function renderIncidentMarkers() {
  if (!map.value) return

  const currentIds = new Set(mapIncidents.value.map((i) => i.id))

  // Remove markers for incidents no longer in the list
  for (const [id, marker] of incidentMarkers.entries()) {
    if (!currentIds.has(id)) {
      marker.remove()
      incidentMarkers.delete(id)
    }
  }

  // Add or update markers
  for (const inc of mapIncidents.value) {
    const loc = inc.location
    if (!loc) continue

    const lat = Number(loc.latitude ?? loc.lat)
    const lng = Number(loc.longitude ?? loc.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (lat === 0 && lng === 0) continue

    let marker = incidentMarkers.get(inc.id)
    if (marker) {
      const cur = marker.getLngLat()
      if (cur.lng !== lng || cur.lat !== lat) {
        marker.setLngLat([lng, lat])
      }
      const el = marker.getElement()
      const wanted = `incident-marker incident-marker--${inc._group}`
      if (el.className !== wanted) el.className = wanted
    } else {
      const el = createIncidentMarkerElement(inc._group, inc.type)
      el.addEventListener('click', () => {
        selectedIncident.value = inc
      })

      marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',   // tip of the pin points at the coordinate
      })
        .setLngLat([lng, lat])
        .addTo(map.value)

      incidentMarkers.set(inc.id, marker)
    }
  }
}

function createIncidentMarkerElement(group, type) {
  const el = document.createElement('button')
  el.className = `incident-marker incident-marker--${group}`
  el.type = 'button'
  el.setAttribute(
    'aria-label',
    `${group === 'mine' ? 'Your incident' : 'Incident'} — tap for details`
  )

  const icons = {
    flat_tire:       '🛞',
    battery:         '🔋',
    fuel:            '⛽',
    stalled_vehicle: '🛑',
    minor_collision: '🚗',
    major_collision: '💥',
    vehicle_fire:    '🔥',
    road_hazard:     '⚠️',
  }
  const icon = icons[type] || '❓'

  el.innerHTML = `
    <span class="incident-marker__pulse" aria-hidden="true"></span>
    <span class="incident-marker__icon" aria-hidden="true">${icon}</span>
    <span class="incident-marker__tail" aria-hidden="true"></span>
  `
  return el
}

// Re-render markers when the incident list changes
watch(mapIncidents, () => {
  if (map.value?.loaded()) renderIncidentMarkers()
})

// =========================================================================
// ACTIONS
// =========================================================================
function recenterOnUser() {
  if (userPosition.value) {
    map.value?.flyTo({
      center: [userPosition.value.lng, userPosition.value.lat],
      zoom: Math.max(DEFAULT_ZOOM, 15),
      duration: 700,
      essential: true,
    })
  } else {
    requestUserLocation()
  }
}

function recenterOnCity() {
  map.value?.flyTo({
    center: CALAPAN_CENTER,
    zoom: DEFAULT_ZOOM,
    duration: 700,
    essential: true,
  })
}

function changeStyle(key) {
  if (!map.value) return
  const option = STYLE_OPTIONS.find((o) => o.key === key)
  if (!option) return

  currentStyleKey.value = key
  localStorage.setItem(STORAGE_KEY, key)
  map.value.setStyle(option.style)

  map.value.once('styledata', () => {
    if (userPosition.value) {
      dropUserMarker(userPosition.value.lng, userPosition.value.lat)
    }
    // Markers were removed by setStyle() — clear the map and re-add
    for (const m of incidentMarkers.values()) m.remove()
    incidentMarkers.clear()
    renderIncidentMarkers()
  })

  showStylePicker.value = false
}

function closeIncidentSheet() {
  selectedIncident.value = null
  acceptError.value = ''
}

async function onAcceptFromSheet() {
  if (!selectedIncident.value || acceptingId.value) return
  const inc = selectedIncident.value
  acceptingId.value = inc.id
  acceptError.value = ''

  try {
    await acceptIncident(inc.id, {
      uid: auth.user?.uid,
      fullName: auth.profile?.fullName || '',
    })
    closeIncidentSheet()
  } catch (e) {
    console.error('[ResponderMapTab] accept failed', e)
    acceptError.value = 'Could not accept. Try again.'
  } finally {
    acceptingId.value = null
  }
}

// =========================================================================
// HELPERS
// =========================================================================
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

function typeLabel(t) {
  return TYPE_LABELS[t] || 'Incident'
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
  if (!userPosition.value || !incident?.location) return null
  const { lat: lat1, lng: lon1 } = userPosition.value
  const lat2 = incident.location.latitude
  const lon2 = incident.location.longitude
  const R = 6371000
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(m) {
  if (m == null) return ''
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(1)} km`
}
</script>

<template>
  <section class="map-tab">
    <div ref="mapContainer" class="map-canvas" />

    <!-- Loading -->
    <Transition name="fade">
      <div v-if="loading" class="loading-overlay">
        <div class="loading-spinner" aria-hidden="true" />
        <p class="loading-text">Loading map…</p>
      </div>
    </Transition>

    <!-- Error -->
    <Transition name="fade">
      <div v-if="loadError" class="error-overlay">
        <p class="error-text">{{ loadError }}</p>
        <button class="btn btn--soft" @click="() => location.reload()">
          Retry
        </button>
      </div>
    </Transition>

    <!-- Top-right controls -->
    <div class="top-controls">
      <button
        class="ctrl-btn"
        :class="{ 'ctrl-btn--active': showStylePicker }"
        aria-label="Change map style"
        @click="showStylePicker = true"
      >
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
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
        class="ctrl-btn"
        aria-label="Center on Calapan City"
        @click="recenterOnCity"
      >
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          <path
            d="M12 21s-7-6.5-7-11.5a7 7 0 1 1 14 0C19 14.5 12 21 12 21Z"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
          />
          <circle cx="12" cy="9.5" r="2.5" stroke="currentColor" stroke-width="2" />
        </svg>
      </button>

      <button
        class="ctrl-btn"
        :class="{ 'ctrl-btn--active': locating }"
        aria-label="Center on my location"
        @click="recenterOnUser"
      >
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          <circle cx="12" cy="12" r="3.5" stroke="currentColor" stroke-width="2" />
          <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2" />
          <path
            d="M12 2v3M12 19v3M2 12h3M19 12h3"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>

    <!-- Legend -->
    <div class="legend">
      <div class="legend-item">
        <span class="legend-dot legend-dot--pending" />
        <span>New</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot legend-dot--mine" />
        <span>Mine</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot legend-dot--other" />
        <span>Others</span>
      </div>
    </div>

    <!-- Attribution -->
    <button
      class="attrib-btn"
      aria-label="Map attribution"
      @click="showAttrib = true"
    >
      ©
    </button>

    <!-- ---------- Incident detail sheet ---------- -->
    <Transition name="sheet">
      <div
        v-if="selectedIncident"
        class="sheet-root"
        role="dialog"
        aria-modal="true"
        @click.self="closeIncidentSheet"
      >
        <div class="sheet-backdrop" @click="closeIncidentSheet" />
        <div class="sheet">
          <div class="sheet-grabber" />

          <header class="sheet-head">
            <div>
              <p class="tiny">
                {{ timeAgo(selectedIncident.createdAt) }}
                <template v-if="formatDistance(distanceTo(selectedIncident))">
                  · {{ formatDistance(distanceTo(selectedIncident)) }} away
                </template>
              </p>
              <h2 class="h2">{{ typeLabel(selectedIncident.type) }}</h2>
            </div>
            <button
              class="sheet-close"
              aria-label="Close"
              @click="closeIncidentSheet"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </header>

          <div class="sheet-body">
            <p v-if="selectedIncident.description" class="sheet-desc">
              {{ selectedIncident.description }}
            </p>

            <div class="sheet-row">
              <span class="sheet-label">Barangay</span>
              <span class="sheet-value">{{ selectedIncident.barangay || '—' }}</span>
            </div>

            <div
              v-if="selectedIncident.citizenName"
              class="sheet-row"
            >
              <span class="sheet-label">Reported by</span>
              <span class="sheet-value">{{ selectedIncident.citizenName }}</span>
            </div>

            <div
              v-if="selectedIncident.status !== 'pending'"
              class="sheet-row"
            >
              <span class="sheet-label">Status</span>
              <span class="sheet-value">{{ statusLabel(selectedIncident.status) }}</span>
            </div>

            <p v-if="acceptError" class="error-text">{{ acceptError }}</p>
          </div>

          <footer class="sheet-foot">
            <template v-if="selectedIncident._group === 'pending'">
              <button
                class="btn btn--ghost"
                @click="closeIncidentSheet"
              >
                Close
              </button>
              <button
                class="btn btn--accept"
                :disabled="acceptingId === selectedIncident.id"
                @click="onAcceptFromSheet"
              >
                {{
                  acceptingId === selectedIncident.id
                    ? 'Accepting…'
                    : 'Accept Request'
                }}
              </button>
            </template>
            <template v-else>
              <button class="btn btn--primary" @click="closeIncidentSheet">
                Close
              </button>
            </template>
          </footer>
        </div>
      </div>
    </Transition>

    <!-- ---------- Style picker ---------- -->
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

    <!-- ---------- Attribution ---------- -->
    <Transition name="fade">
      <div v-if="showAttrib" class="attrib-overlay" @click="showAttrib = false">
        <div class="attrib-card" @click.stop>
          <p class="attrib-title">Map data</p>
          <p class="attrib-text">
            © <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>
            · © <a href="https://www.openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a>
            · Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
          </p>
          <button class="btn btn--primary" @click="showAttrib = false">Close</button>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.map-tab {
  position: relative;
  flex: 1;
  width: 100%;
  min-height: 100%;
  overflow: hidden;
  background: var(--bg);
}

.map-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* ---------- Loading + Error ---------- */
.loading-overlay,
.error-overlay {
  position: absolute;
  inset: 0;
  background: var(--bg);
  display: grid;
  place-items: center;
  z-index: 5;
}

.error-overlay { flex-direction: column; gap: 16px; padding: 40px; }

.loading-spinner {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin { to { transform: rotate(360deg); } }

.loading-text,
.error-text {
  font-size: 0.875rem;
  color: var(--text-muted);
  text-align: center;
}

/* ---------- Top controls ---------- */
.top-controls {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 4;
}

.ctrl-btn {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(18, 28, 46, 0.92);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border);
  color: var(--text);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.ctrl-btn:active { transform: scale(0.92); }
.ctrl-btn--active { color: var(--accent); border-color: var(--accent); }

/* ---------- Legend ---------- */
.legend {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  left: 12px;
  background: rgba(18, 28, 46, 0.92);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 4;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-muted);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-dot--pending { background: #e63946; }
.legend-dot--mine    { background: #2f9e73; }
.legend-dot--other   { background: #f59e0b; }

/* ---------- Attribution button ---------- */
.attrib-btn {
  position: absolute;
  left: 12px;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 88px);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(18, 28, 46, 0.85);
  backdrop-filter: blur(8px);
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  display: grid;
  place-items: center;
  z-index: 4;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

/* ---------- Incident detail sheet ---------- */
.sheet-root {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.sheet-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.sheet {
  position: relative;
  background: var(--bg-elev);
  border-top-left-radius: 22px;
  border-top-right-radius: 22px;
  border: 1px solid var(--border);
  border-bottom: none;
  max-height: 80dvh;
  display: flex;
  flex-direction: column;
  padding-bottom: var(--sab);
  animation: sheet-up 0.22s ease;
}

@keyframes sheet-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

.sheet-grabber {
  width: 40px;
  height: 4px;
  background: var(--border);
  border-radius: 99px;
  margin: 8px auto 4px;
}

.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 20px 12px;
  border-bottom: 1px solid var(--border);
}

.sheet-close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-input);
  border: none;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.sheet-desc {
  font-size: 0.9375rem;
  color: var(--text);
  line-height: 1.5;
  margin-bottom: 16px;
}

.sheet-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}

.sheet-label {
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.sheet-value {
  font-size: 0.9375rem;
  color: var(--text);
  text-align: right;
}

.sheet-foot {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
}

.sheet-foot .btn { flex: 1; }
.sheet-foot .btn--ghost { flex: 0.6; }

.btn--accept {
  background: linear-gradient(160deg, #3cb886 0%, var(--accent) 55%, #267a58 100%);
  color: #fff;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(47, 158, 115, 0.4);
}

/* ---------- Style picker ---------- */
.picker-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: calc(env(safe-area-inset-top, 0px) + 68px) 12px 0;
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(2px);
}

.picker-card {
  width: 240px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

.picker-title {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 8px;
  padding-left: 4px;
}

.style-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--text);
  cursor: pointer;
  text-align: left;
}

.style-option--on {
  background: var(--bg-input);
  border-color: var(--border);
}

.style-preview {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  flex-shrink: 0;
  border: 1px solid var(--border);
}

.style-body { display: flex; flex-direction: column; min-width: 0; flex: 1; }

.style-label { font-size: 0.875rem; font-weight: 650; }

.style-check { color: var(--accent); flex-shrink: 0; }

/* ---------- Attribution ---------- */
.attrib-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: end center;
  padding: 0 20px calc(env(safe-area-inset-bottom, 0px) + 100px);
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
}

.attrib-card {
  width: 100%;
  max-width: 440px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px;
  text-align: center;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

.attrib-title {
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.attrib-text {
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.attrib-text a { color: var(--primary); text-decoration: underline; }

/* ---------- Fade ---------- */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>

<!-- ============================================================
     GLOBAL STYLES (unscoped) — MapLibre DOM lives outside scoped
     ============================================================ -->
<style>
/* ============================================================
   USER LOCATION DOT — box-shadow pulse (no transform)
   ============================================================ */
.user-dot {
  position: relative;
  width: 14px;
  height: 14px;
  pointer-events: none;
}

.user-dot__core {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: #2f9e73;
  border: 2.5px solid #fff;
  animation: user-pulse 2s ease-out infinite;
}

@keyframes user-pulse {
  0% {
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.35),
      0 0 0 0 rgba(47, 158, 115, 0.65);
  }
  70% {
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.35),
      0 0 0 18px rgba(47, 158, 115, 0);
  }
  100% {
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.35),
      0 0 0 18px rgba(47, 158, 115, 0);
  }
}

/* ============================================================
   INCIDENT MARKERS — teardrop pins
   Outer element stays transform-free so MapLibre's positioning
   transform is never fought by a CSS transition.
   ============================================================ */
.incident-marker {
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
}

/* Colour per group — set once, used by head + tail + pulse */
.incident-marker--pending { --pin: #e63946; }
.incident-marker--mine    { --pin: #2f9e73; }
.incident-marker--other   { --pin: #f59e0b; }

/* Soft pulse — anchored to head, not tail */
.incident-marker__pulse {
  position: absolute;
  top: 0;
  left: 50%;
  width: 40px;
  height: 40px;
  margin-left: -20px;
  border-radius: 50%;
  background: var(--pin);
  opacity: 0.45;
  z-index: 1;
  pointer-events: none;
  transform-origin: center;
  animation: marker-pulse 2s ease-out infinite;
}

@keyframes marker-pulse {
  0%   { transform: scale(1);   opacity: 0.45; }
  70%  { transform: scale(1.8); opacity: 0;    }
  100% { transform: scale(1.8); opacity: 0;    }
}

/* Circular head */
.incident-marker__icon {
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
  background: var(--pin);
  border: 3px solid #fff;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
  z-index: 2;
  transform-origin: center;
  transition: transform 0.12s ease;
}
.incident-marker:active .incident-marker__icon {
  transform: scale(0.92);
}

/* Tail — tip points at the coordinate */
.incident-marker__tail {
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
  filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.3));
}

/* Other responders' incidents — no pulse */
.incident-marker--other .incident-marker__pulse {
  display: none;
}

/* Mine — faster pulse (higher priority) */
.incident-marker--mine .incident-marker__pulse {
  animation-duration: 1.4s;
}

/* Focus ring */
.incident-marker:focus-visible .incident-marker__icon {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.6),
              0 4px 10px rgba(0, 0, 0, 0.4);
}

/* MapLibre controls */
.maplibregl-ctrl-group {
  background: rgba(18, 28, 46, 0.92) !important;
  backdrop-filter: blur(10px);
  border: 1px solid var(--border) !important;
  border-radius: 12px !important;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
}

.maplibregl-ctrl-group button {
  background: transparent !important;
  color: var(--text) !important;
  width: 42px !important;
  height: 42px !important;
  min-width: 42px !important;
  min-height: 42px !important;
  font-size: 20px !important;
}

.maplibregl-ctrl-group button + button {
  border-top: 1px solid var(--border) !important;
}

.maplibregl-ctrl-bottom-right {
  bottom: calc(env(safe-area-inset-bottom, 0px) + 88px) !important;
  right: 12px !important;
}
</style>