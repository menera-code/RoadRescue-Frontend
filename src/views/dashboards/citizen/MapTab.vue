<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

// =========================================================================
// CONSTANTS
// =========================================================================

// Calapan City, Oriental Mindoro — [longitude, latitude]
const CALAPAN_CENTER = [121.1803, 13.4108]
const DEFAULT_ZOOM = 13

// Satellite raster style (inline — no external JSON to fetch)
const SATELLITE_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      attribution: '© EOX Sentinel-2 cloudless',
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

// Available map styles
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

// Load preferred style from localStorage (fallback to bright)
const currentStyleKey = ref(
  localStorage.getItem(STORAGE_KEY) || DEFAULT_STYLE_KEY
)

let userMarker = null

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
      new maplibregl.NavigationControl({
        showCompass: false,
        showZoom: true,
      }),
      'bottom-right'
    )

    map.value.on('load', () => {
      loading.value = false
    })

    map.value.on('error', (e) => {
      if (e?.error?.message && !e.error.message.includes('tile')) {
        loadError.value = 'Could not load the map.'
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

      map.value?.flyTo({
        center: [longitude, latitude],
        zoom: Math.max(DEFAULT_ZOOM, 15),
        duration: 900,
        essential: true,
      })
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
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
    }
  )
}

function dropUserMarker(lng, lat) {
  if (!map.value) {
    console.warn('[MapTab] cannot drop marker — map not ready')
    return
  }

  if (userMarker) userMarker.remove()

  const el = document.createElement('div')
  el.className = 'user-dot'
  el.innerHTML = `<span class="user-dot__pulse"></span><span class="user-dot__core"></span>`

  userMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat([lng, lat])
    .addTo(map.value)
}

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

// ---------- Style switching ----------
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

  // DOM-based markers survive setStyle(), but re-add defensively after the
  // new style's sources are ready — some MapLibre versions clean up markers.
  map.value.once('styledata', () => {
    if (userPosition.value) {
      dropUserMarker(userPosition.value.lng, userPosition.value.lat)
    }
  })

  showStylePicker.value = false
}

defineExpose({
  map,
  userPosition,
  recenterOnUser,
})
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

    <!-- Top-right floating controls -->
    <div class="top-controls">
      <!-- Style picker -->
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

      <!-- Recenter on city -->
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

      <!-- Recenter on user -->
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
      <div v-if="locationError" class="toast">
        {{ locationError }}
      </div>
    </Transition>

    <!-- Custom attribution button -->
    <button
      class="attrib-btn"
      aria-label="Map attribution"
      @click="showAttrib = true"
    >
      ©
    </button>

    <!-- ============================================================
         Style picker popover
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
         Attribution popover
         ============================================================ -->
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
            <a
              href="https://openfreemap.org"
              target="_blank"
              rel="noopener"
            >OpenFreeMap</a>
            ·
            ©
            <a
              href="https://www.openmaptiles.org"
              target="_blank"
              rel="noopener"
            >OpenMapTiles</a>
            · Data ©
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener"
            >OpenStreetMap</a>
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

/* ---------- Loading ---------- */
.loading-overlay {
  position: absolute;
  inset: 0;
  background: var(--bg);
  display: grid;
  place-items: center;
  z-index: 5;
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

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 0.875rem;
  color: var(--text-muted);
  text-align: center;
}

/* ---------- Error ---------- */
.error-overlay {
  position: absolute;
  inset: 0;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px 24px;
  z-index: 6;
  text-align: center;
}

.error-text {
  font-size: 0.9375rem;
  color: var(--text-muted);
  max-width: 28ch;
}

/* ---------- Top-right controls ---------- */
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
  transition: all 0.15s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.ctrl-btn:active { transform: scale(0.92); }

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

/* ---------- Custom attribution button ---------- */
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
  -webkit-tap-highlight-color: transparent;
}

.attrib-btn:active { transform: scale(0.9); }

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
  animation: drop 0.18s ease;
}

@keyframes drop {
  from {
    transform: translateY(-6px) scale(0.97);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
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

.style-option:active {
  transform: scale(0.98);
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

.style-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.style-label {
  font-size: 0.875rem;
  font-weight: 650;
  line-height: 1.2;
}

.style-hint {
  font-size: 0.6875rem;
  color: var(--text-muted);
  margin-top: 1px;
}

.style-check {
  color: var(--primary);
  flex-shrink: 0;
  display: grid;
  place-items: center;
}

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

.attrib-text a {
  color: var(--primary);
  text-decoration: underline;
}

/* ---------- Fade transition ---------- */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

<!-- ============================================================
     GLOBAL STYLES — unscoped (MapLibre generates DOM elements
     outside this component's scoped boundary)
     ============================================================ -->
<style>
/* Pulsing user-location dot */
.user-dot {
  position: relative;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
}

.user-dot__core {
  position: relative;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #2f9e73;
  border: 2.5px solid #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  z-index: 2;
}

.user-dot__pulse {
  position: absolute;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #2f9e73;
  opacity: 0.5;
  animation: pulse 1.8s ease-out infinite;
  z-index: 1;
}

@keyframes pulse {
  0% { transform: scale(0.6); opacity: 0.6; }
  100% { transform: scale(2); opacity: 0; }
}

/* Zoom control styling */
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

.maplibregl-ctrl-zoom-in,
.maplibregl-ctrl-zoom-out {
  width: 42px !important;
  height: 42px !important;
  color: white !important;
  font-size: 20px !important;
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