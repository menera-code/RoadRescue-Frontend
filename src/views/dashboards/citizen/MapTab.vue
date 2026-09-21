<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { useIncidents } from '@/composables/useIncidents'
import MediaGallery from '@/components/MediaGallery.vue'

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
      tiles: ['https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}'],
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

const STORAGE_KEY = 'rr:mapStyle'
const DEFAULT_STYLE_KEY = 'bright'

// =========================================================================
// DATA — my reports (every status, incl. unverified)
// =========================================================================
const { incidents: myReports, loading: reportsLoading } = useIncidents({
  statuses: null,        // all statuses
  scope: 'createdByMe',  // only incidents where citizenUid == my uid
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
const selectedReport = ref(null)

const currentStyleKey = ref(
  localStorage.getItem(STORAGE_KEY) || DEFAULT_STYLE_KEY
)

let hasAutoFit = false

let userMarker = null
const reportMarkers = new Map() // id → maplibregl.Marker

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
      renderReportMarkers()
      fitToMyReports({ animate: false })
      hasAutoFit = true
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
  for (const m of reportMarkers.values()) m.remove()
  reportMarkers.clear()
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
        console.error('[MapTab] MapLibre error:', e)
      }
    })
  } catch (e) {
    console.error('[MapTab] failed to initialize map', e)
    loadError.value = 'Could not initialize the map.'
    loading.value = false
  }
}

// =========================================================================
// GEOLOCATION
// =========================================================================
function requestUserLocation() {
  if (!('geolocation' in navigator)) {
    locationError.value = 'Geolocation not supported on this device.'
    return
  }

  locating.value = true
  locationError.value = ''

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false
      const { longitude, latitude, accuracy } = pos.coords
      userPosition.value = { lng: longitude, lat: latitude, accuracy }
      dropUserMarker(longitude, latitude)

      if (!myReports.value.length) {
        map.value?.flyTo({
          center: [longitude, latitude],
          zoom: Math.max(DEFAULT_ZOOM, 15),
          duration: 900,
          essential: true,
        })
      }
    },
    (err) => {
      locating.value = false
      switch (err.code) {
        case err.PERMISSION_DENIED:
          locationError.value = 'Location permission denied.'
          break
        case err.POSITION_UNAVAILABLE:
          locationError.value = 'Location unavailable.'
          break
        case err.TIMEOUT:
          locationError.value = 'Location request timed out.'
          break
        default:
          locationError.value = 'Could not get your location.'
      }
    },
    // maximumAge: 0 → always fetch a fresh GPS reading. Otherwise the
    // browser can hand back a position up to 30s old and the dot lags.
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  )
}

function dropUserMarker(lng, lat) {
  if (!map.value) return
  if (userMarker) userMarker.remove()

  // ---------------------------------------------------------------------
  // Two-element structure:
  //   outer .user-dot-anchor → MapLibre positions this via translate().
  //     We must NOT set position/top/left/transform on it.
  //   inner .user-dot        → visual dot, absolutely centered on the
  //     anchor origin via margin offsets. No transform, ever.
  // ---------------------------------------------------------------------
  const el = document.createElement('div')
  el.className = 'user-dot-anchor'
  el.innerHTML = `<span class="user-dot"></span>`

  userMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat([lng, lat])
    .addTo(map.value)
}

// =========================================================================
// REPORT MARKERS
// =========================================================================
function renderReportMarkers() {
  if (!map.value) return

  const currentIds = new Set(myReports.value.map((i) => i.id))

  for (const [id, marker] of reportMarkers.entries()) {
    if (!currentIds.has(id)) {
      marker.remove()
      reportMarkers.delete(id)
    }
  }

  for (const inc of myReports.value) {
    const loc = inc.location
    if (!loc) continue

    const lat = Number(loc.latitude ?? loc.lat)
    const lng = Number(loc.longitude ?? loc.lng)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (lat === 0 && lng === 0) continue

    const tone = statusTone(inc.status)
    let marker = reportMarkers.get(inc.id)

    if (marker) {
      const cur = marker.getLngLat()
      if (cur.lng !== lng || cur.lat !== lat) {
        marker.setLngLat([lng, lat])
      }
      const el = marker.getElement()
      const wantedClass = `inc-marker inc-marker--${tone}`
      if (el.className !== wantedClass) {
        el.className = wantedClass
      }
    } else {
      const el = createReportMarkerElement(inc, tone)
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        selectedReport.value = inc
      })

      marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
      })
        .setLngLat([lng, lat])
        .addTo(map.value)

      reportMarkers.set(inc.id, marker)
    }
  }
}

function createReportMarkerElement(inc, tone) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `inc-marker inc-marker--${tone}`
  el.setAttribute('aria-label', `${typeLabel(inc.type)} — tap for details`)

  el.innerHTML = `
    <span class="inc-marker__pulse" aria-hidden="true"></span>
    <span class="inc-marker__icon" aria-hidden="true">${typeIcon(inc.type)}</span>
    <span class="inc-marker__tail" aria-hidden="true"></span>
  `

  return el
}

watch(
  myReports,
  () => {
    if (!map.value?.loaded()) return
    renderReportMarkers()

    if (!hasAutoFit && myReports.value.length) {
      fitToMyReports({ animate: true })
      hasAutoFit = true
    }
  },
  { deep: false }
)

// =========================================================================
// FIT + RECENTER
// =========================================================================
function fitToMyReports({ animate = true } = {}) {
  if (!map.value) return

  const withLoc = myReports.value
    .map((i) => {
      const loc = i.location
      if (!loc) return null
      const lat = Number(loc.latitude ?? loc.lat)
      const lng = Number(loc.longitude ?? loc.lng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      if (lat === 0 && lng === 0) return null
      return { lat, lng }
    })
    .filter(Boolean)

  if (!withLoc.length) {
    map.value.flyTo({
      center: CALAPAN_CENTER,
      zoom: DEFAULT_ZOOM,
      duration: animate ? 700 : 0,
      essential: true,
    })
    return
  }

  if (withLoc.length === 1) {
    map.value.flyTo({
      center: [withLoc[0].lng, withLoc[0].lat],
      zoom: 16,
      duration: animate ? 700 : 0,
      essential: true,
    })
    return
  }

  const bounds = new maplibregl.LngLatBounds()
  withLoc.forEach((p) => bounds.extend([p.lng, p.lat]))
  map.value.fitBounds(bounds, {
    padding: 80,
    duration: animate ? 700 : 0,
    maxZoom: 16,
  })
}

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

// =========================================================================
// STYLE SWITCHING
// =========================================================================
function openStylePicker() {
  showStylePicker.value = true
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
    for (const m of reportMarkers.values()) m.remove()
    reportMarkers.clear()
    renderReportMarkers()
  })

  showStylePicker.value = false
}

// =========================================================================
// HELPERS
// =========================================================================
const TYPE_ICONS = {
  flat_tire: '🛞',
  battery: '🔋',
  fuel: '⛽',
  stalled_vehicle: '🛑',
  minor_collision: '🚗',
  major_collision: '💥',
  vehicle_fire: '🔥',
  road_hazard: '⚠️',
  emergency: '🚨',
  other: '❓',
}

const TYPE_LABELS = {
  flat_tire: 'Flat Tire',
  battery: 'Dead Battery',
  fuel: 'Out of Fuel',
  stalled_vehicle: 'Stalled Vehicle',
  minor_collision: 'Minor Crash',
  major_collision: 'Major Crash',
  vehicle_fire: 'Vehicle Fire',
  road_hazard: 'Road Hazard',
  emergency: 'Emergency',
  other: 'Incident',
}

function typeIcon(t) {
  return TYPE_ICONS[t] || '❓'
}
function typeLabel(t) {
  return TYPE_LABELS[t] || 'Incident'
}

function statusTone(status) {
  if (status === 'unverified') return 'unverified'
  if (status === 'pending') return 'pending'
  if (['accepted', 'en_route', 'on_scene'].includes(status)) return 'active'
  if (status === 'resolved') return 'resolved'
  if (status === 'cancelled') return 'cancelled'
  return 'muted'
}

function statusLabel(status) {
  return (
    {
      unverified: 'Awaiting review',
      pending: 'Waiting for responder',
      accepted: 'Responder accepted',
      en_route: 'Responder on the way',
      on_scene: 'Responder on scene',
      resolved: 'Resolved',
      cancelled: 'Cancelled',
    }[status] || status
  )
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

function openInMaps(loc) {
  if (!loc?.latitude || !loc?.longitude) return
  window.open(
    `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`,
    '_blank',
    'noopener'
  )
}

function closeReport() {
  selectedReport.value = null
}

const reportCount = computed(() => myReports.value.length)
</script>

<template>
  <section class="map-tab">
    <div ref="mapContainer" class="map-canvas" />

    <!-- Loading overlay -->
    <Transition name="fade">
      <div v-if="loading" class="loading-overlay">
        <div class="loading-spinner" aria-hidden="true" />
        <p class="loading-text">Loading map…</p>
      </div>
    </Transition>

    <!-- Error overlay -->
    <Transition name="fade">
      <div v-if="loadError" class="error-overlay">
        <p class="error-text">{{ loadError }}</p>
        <button class="btn btn--soft" @click="() => location.reload()">
          Retry
        </button>
      </div>
    </Transition>

    <!-- My-reports pill -->
    <Transition name="fade">
      <div v-if="!loading && reportCount > 0" class="reports-pill">
        <span class="reports-pill__dot" aria-hidden="true" />
        <span>
          {{ reportCount }} {{ reportCount === 1 ? 'report' : 'reports' }}
        </span>
      </div>
    </Transition>

    <!-- Top-right floating controls -->
    <div class="top-controls">
      <button
        class="ctrl-btn"
        :class="{ 'ctrl-btn--active': showStylePicker }"
        aria-label="Change map style"
        @click="openStylePicker"
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
        aria-label="Show my reports"
        :disabled="!reportCount"
        @click="fitToMyReports({ animate: true })"
      >
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
          <path
            d="M3 9V5a2 2 0 0 1 2-2h4M15 3h4a2 2 0 0 1 2 2v4M21 15v4a2 2 0 0 1-2 2h-4M9 21H5a2 2 0 0 1-2-2v-4"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
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

    <!-- Location error toast -->
    <Transition name="fade">
      <div v-if="locationError" class="toast">{{ locationError }}</div>
    </Transition>

    <!-- Empty state -->
    <Transition name="fade">
      <div
        v-if="!loading && !reportCount && !reportsLoading"
        class="empty-hint"
      >
        <p class="empty-hint__title">No reports on the map yet</p>
        <p class="empty-hint__text tiny">
          Submit a report and it'll show up here.
        </p>
      </div>
    </Transition>

    <!-- Attribution button -->
    <button
      class="attrib-btn"
      aria-label="Map attribution"
      @click="showAttrib = true"
    >
      ©
    </button>

    <!-- ============================================================
         Report detail sheet
         ============================================================ -->
    <Transition name="sheet">
      <div
        v-if="selectedReport"
        class="sheet-root"
        role="dialog"
        aria-modal="true"
        @click.self="closeReport"
      >
        <div class="sheet-backdrop" @click="closeReport" />
        <div class="sheet">
          <div class="sheet-grabber" />

          <header class="sheet-head">
            <div class="sheet-head-text">
              <div class="sheet-title-row">
                <span class="sheet-type-icon" aria-hidden="true">
                  {{ typeIcon(selectedReport.type) }}
                </span>
                <div>
                  <p class="tiny">{{ timeAgo(selectedReport.createdAt) }}</p>
                  <h2 class="h2">{{ typeLabel(selectedReport.type) }}</h2>
                </div>
              </div>
              <span
                class="status-chip"
                :class="`status-chip--${statusTone(selectedReport.status)}`"
              >
                {{ statusLabel(selectedReport.status) }}
              </span>
            </div>

            <button
              class="sheet-close"
              aria-label="Close"
              @click="closeReport"
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
            <p v-if="selectedReport.description" class="sheet-desc">
              {{ selectedReport.description }}
            </p>

            <MediaGallery
              v-if="selectedReport.photoUrls?.length || selectedReport.videoUrl"
              :photo-urls="selectedReport.photoUrls || []"
              :video-url="selectedReport.videoUrl || null"
              mode="compact"
              class="sheet-media"
            />

            <div class="sheet-row">
              <span class="sheet-label">Barangay</span>
              <span class="sheet-value">
                {{ selectedReport.barangay || '—' }}
              </span>
            </div>

            <div
              v-if="selectedReport.responderName || selectedReport.assignedResponderName"
              class="sheet-row"
            >
              <span class="sheet-label">Responder</span>
              <span class="sheet-value">
                {{ selectedReport.assignedResponderName || selectedReport.responderName }}
              </span>
            </div>

            <div v-if="selectedReport.location" class="sheet-row">
              <span class="sheet-label">Coordinates</span>
              <span class="sheet-value sheet-value--mono">
                {{ Number(selectedReport.location.latitude).toFixed(5) }},
                {{ Number(selectedReport.location.longitude).toFixed(5) }}
              </span>
            </div>

            <div v-if="selectedReport.accuracy" class="sheet-row">
              <span class="sheet-label">GPS accuracy</span>
              <span class="sheet-value">
                ± {{ Math.round(selectedReport.accuracy) }} m
              </span>
            </div>
          </div>

          <footer class="sheet-foot">
            <button
              v-if="selectedReport.location"
              class="btn btn--ghost"
              @click="openInMaps(selectedReport.location)"
            >
              📍 Open in Maps
            </button>
            <button class="btn btn--primary" @click="closeReport">
              Close
            </button>
          </footer>
        </div>
      </div>
    </Transition>

    <!-- Style picker -->
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

    <!-- Attribution popover -->
    <Transition name="fade">
      <div
        v-if="showAttrib"
        class="attrib-overlay"
        @click="showAttrib = false"
      >
        <div class="attrib-card" @click.stop>
          <p class="attrib-title">Map data</p>
          <p class="attrib-text">
            ©
            <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>
            ·
            ©
            <a href="https://www.openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a>
            · Data ©
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
            contributors
          </p>
          <button class="btn btn--primary" @click="showAttrib = false">
            Close
          </button>
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

/* ---------- Loading / Error ---------- */
.loading-overlay,
.error-overlay {
  position: absolute;
  inset: 0;
  background: var(--bg);
  display: grid;
  place-items: center;
  z-index: 5;
}
.error-overlay {
  flex-direction: column;
  gap: 16px;
  padding: 40px 24px;
  text-align: center;
}
.loading-spinner {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
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

/* ---------- Reports pill ---------- */
.reports-pill {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  left: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(18, 28, 46, 0.92);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border);
  border-radius: 99px;
  font-size: 0.75rem;
  font-weight: 650;
  color: var(--text);
  z-index: 4;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.reports-pill__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 4px rgba(230, 57, 70, 0.25);
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
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--border);
  color: var(--text);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease, border-color 0.15s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}
.ctrl-btn:active { transform: scale(0.92); }
.ctrl-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.ctrl-btn--active {
  color: var(--primary);
  border-color: var(--primary);
}

/* ---------- Toast ---------- */
.toast {
  position: absolute;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 90px);
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 16px;
  background: rgba(18, 28, 46, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  font-size: 0.8125rem;
  z-index: 3;
  max-width: calc(100% - 40px);
  text-align: center;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
}

/* ---------- Empty hint ---------- */
.empty-hint {
  position: absolute;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 96px);
  left: 50%;
  transform: translateX(-50%);
  width: min(320px, calc(100% - 40px));
  padding: 14px 18px;
  background: rgba(18, 28, 46, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  text-align: center;
  z-index: 3;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.empty-hint__title {
  font-size: 0.9375rem;
  font-weight: 700;
  margin-bottom: 4px;
}
.empty-hint__text { line-height: 1.5; }

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
  transition: transform 0.12s ease;
}
.attrib-btn:active { transform: scale(0.9); }

/* ---------- Report sheet ---------- */
.sheet-root {
  position: absolute;
  inset: 0;
  z-index: 30;
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
.sheet-head-text { min-width: 0; flex: 1; }
.sheet-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.sheet-type-icon { font-size: 1.5rem; line-height: 1; }
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
  padding: 14px 20px;
}
.sheet-desc {
  font-size: 0.9375rem;
  color: var(--text);
  line-height: 1.5;
  margin-bottom: 14px;
}
.sheet-media { margin-bottom: 14px; }
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
  flex-shrink: 0;
}
.sheet-value {
  font-size: 0.9375rem;
  color: var(--text);
  text-align: right;
  word-break: break-word;
  min-width: 0;
}
.sheet-value--mono {
  font-family: ui-monospace, monospace;
  font-size: 0.8125rem;
  letter-spacing: 0.02em;
}
.sheet-foot {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
}
.sheet-foot .btn { flex: 1; }
.sheet-foot .btn--ghost { flex: 0.8; }

/* ---------- Status chip ---------- */
.status-chip {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 10px;
  border-radius: 6px;
}
.status-chip--unverified { color: #f59e0b; background: rgba(245, 158, 11, 0.14); }
.status-chip--pending    { color: #f59e0b; background: rgba(245, 158, 11, 0.14); }
.status-chip--active     { color: #3b82f6; background: rgba(59, 130, 246, 0.14); }
.status-chip--resolved   { color: var(--accent); background: var(--accent-soft); }
.status-chip--cancelled  { color: var(--text-dim); background: var(--bg-input); }
.status-chip--muted      { color: var(--text-muted); background: var(--bg-input); }

/* ---------- Style picker ---------- */
.picker-overlay {
  position: absolute;
  inset: 0;
  z-index: 40;
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
  animation: drop 0.18s ease;
}
@keyframes drop {
  from { transform: translateY(-6px) scale(0.97); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
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
  transition: all 0.15s ease;
}
.style-option:active { transform: scale(0.98); }
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
.style-label { font-size: 0.875rem; font-weight: 650; line-height: 1.2; }
.style-hint { font-size: 0.6875rem; color: var(--text-muted); margin-top: 1px; }
.style-check { color: var(--primary); flex-shrink: 0; display: grid; place-items: center; }

/* ---------- Attribution popover ---------- */
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
  padding: 20px 20px 16px;
  text-align: center;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  animation: pop 0.2s ease;
}
@keyframes pop {
  from { transform: scale(0.94); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
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
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>

<!-- ============================================================
     GLOBAL STYLES — MapLibre DOM lives outside scoped boundary
     ============================================================ -->
<style>
/* ============================================================
   USER LOCATION DOT

   Two-element structure:
     .user-dot-anchor  → given to MapLibre. It writes position:absolute
                         + transform: translate(x, y) on this node.
                         We must NEVER set position/top/left/transform
                         here, or we override MapLibre and the dot drifts
                         with the map during zoom.
     .user-dot         → inner visual dot, centered on the anchor's
                         (0,0) via negative margins (no transform).
                         Pulse is a box-shadow animation only.
   ============================================================ */
.user-dot-anchor {
  /* Intentionally empty for positioning.
     MapLibre adds .maplibregl-marker which supplies position:absolute.
     Any positioning CSS here will break zoom sync. */
  pointer-events: none;
}

.user-dot {
  position: absolute;
  top: 0;
  left: 0;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;   /* center the 14px dot on the anchor origin */
  border-radius: 50%;
  background: #2f9e73;
  border: 2.5px solid #fff;
  pointer-events: none;
  animation: user-pulse 2s ease-out infinite;
  /* No transform here — ever. */
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
   REPORT MARKER — teardrop pin, tip at the coordinate.
   Outer <button> is transform-free so MapLibre's positioning
   transform is never fought by a CSS transition.
   ============================================================ */
.inc-marker {
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

.inc-marker--unverified { --pin: #f59e0b; }
.inc-marker--pending    { --pin: #e63946; }
.inc-marker--active     { --pin: #3b82f6; }
.inc-marker--resolved   { --pin: #2f9e73; }
.inc-marker--cancelled  { --pin: #64748b; }
.inc-marker--muted      { --pin: #64748b; }

.inc-marker__pulse {
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

.inc-marker__icon {
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
.inc-marker:active .inc-marker__icon {
  transform: scale(0.92);
}

.inc-marker__tail {
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

.inc-marker--resolved .inc-marker__pulse,
.inc-marker--cancelled .inc-marker__pulse,
.inc-marker--muted .inc-marker__pulse {
  animation: none;
  display: none;
}

.inc-marker:focus-visible .inc-marker__icon {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.6),
              0 4px 10px rgba(0, 0, 0, 0.4);
}

/* ============================================================
   MapLibre controls
   ============================================================ */
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
  line-height: 1 !important;
}
.maplibregl-ctrl-group button + button {
  border-top: 1px solid var(--border) !important;
}
.maplibregl-ctrl-group button:hover {
  background: var(--bg-input) !important;
}
.maplibregl-ctrl-bottom-right {
  bottom: calc(env(safe-area-inset-bottom, 0px) + 88px) !important;
  right: 12px !important;
}
</style>