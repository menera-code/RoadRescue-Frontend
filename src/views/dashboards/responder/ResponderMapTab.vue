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

// =========================================================================
// CONSTANTS
// =========================================================================
const CALAPAN_CENTER = [121.1803, 13.4108]
const DEFAULT_ZOOM = 13
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

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

// Route layer IDs — kept in one place so cleanup is reliable.
const ROUTE_SOURCE_ID = 'route'
const ROUTE_LAYER_IDS = [
  'route-line-preview',
  'route-line-solid',
  'route-line-casing',
]

// =========================================================================
// STORE + DATA
// =========================================================================
const auth = useAuthStore()

const { incidents: pendingIncidents } = useIncidents({
  statuses: STATUS_GROUPS.OPEN,
  scope: 'all',
})

const { incidents: myIncidents } = useIncidents({
  statuses: STATUS_GROUPS.ACTIVE,
  scope: 'assignedToMe',
})

const { incidents: otherActiveIncidents } = useIncidents({
  statuses: STATUS_GROUPS.ACTIVE,
  scope: 'all',
})

const optimisticAcceptedIds = ref(new Set())

const mapIncidents = computed(() => {
  const seen = new Set()
  const out = []

  for (const i of myIncidents.value) {
    if (seen.has(i.id)) continue
    seen.add(i.id)
    out.push({ ...i, _group: 'mine' })
  }

  for (const i of pendingIncidents.value) {
    if (seen.has(i.id)) continue
    seen.add(i.id)
    const group = optimisticAcceptedIds.value.has(i.id) ? 'mine' : 'pending'
    out.push({ ...i, _group: group })
  }

  for (const i of otherActiveIncidents.value) {
    if (seen.has(i.id)) continue
    seen.add(i.id)
    out.push({ ...i, _group: 'other' })
  }

  return out
})

watch(myIncidents, (list) => {
  if (!optimisticAcceptedIds.value.size) return
  const next = new Set(optimisticAcceptedIds.value)
  let changed = false
  for (const inc of list) {
    if (next.has(inc.id)) {
      next.delete(inc.id)
      changed = true
    }
  }
  if (changed) optimisticAcceptedIds.value = next
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

const selectedIncidentId = ref(null)

const selectedIncident = computed(
  () => mapIncidents.value.find((i) => i.id === selectedIncidentId.value) || null
)

const acceptingId = ref(null)
const acceptError = ref('')

// Routing state
const routeGeojson = ref(null)
const routeMeta = ref(null)
const routeLoading = ref(false)
const routeError = ref('')
let routeAbortController = null

const currentStyleKey = ref(
  localStorage.getItem(STORAGE_KEY) || DEFAULT_STYLE_KEY
)

let userMarker = null
const incidentMarkers = new Map()

function currentStyleOption() {
  return (
    STYLE_OPTIONS.find((o) => o.key === currentStyleKey.value) ||
    STYLE_OPTIONS[0]
  )
}

const routeMode = computed(() => {
  const inc = selectedIncident.value
  if (!inc) return null
  if (inc._group === 'other') return null
  return inc._group === 'mine' ? 'active' : 'preview'
})

// =========================================================================
// INIT
// =========================================================================
onMounted(async () => {
  await nextTick()
  initMap()
})

onBeforeUnmount(() => {
  if (routeAbortController) routeAbortController.abort()
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

    map.value.on('load', () => {
      loading.value = false
      requestUserLocation()
      renderIncidentMarkers()
      ensureRouteLayers()
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
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  )
}

function dropUserMarker(lng, lat) {
  if (!map.value) return
  if (userMarker) userMarker.remove()

  const el = document.createElement('div')
  el.className = 'user-marker-dot'

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

  for (const [id, marker] of incidentMarkers.entries()) {
    if (!currentIds.has(id)) {
      marker.remove()
      incidentMarkers.delete(id)
    }
  }

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

      const id = inc.id
      el.addEventListener('click', () => openDetail(id))

      marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
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
    flat_tire: '🛞',
    battery: '🔋',
    fuel: '⛽',
    stalled_vehicle: '🛑',
    minor_collision: '🚗',
    major_collision: '💥',
    vehicle_fire: '🔥',
    road_hazard: '⚠️',
  }
  const icon = icons[type] || '❓'

  el.innerHTML = `
    <span class="incident-marker__pulse" aria-hidden="true"></span>
    <span class="incident-marker__icon" aria-hidden="true">${icon}</span>
    <span class="incident-marker__tail" aria-hidden="true"></span>
  `
  return el
}

watch(mapIncidents, () => {
  if (map.value?.loaded()) renderIncidentMarkers()
})

watch(selectedIncident, (inc) => {
  if (!inc && selectedIncidentId.value) {
    selectedIncidentId.value = null
    clearRoute()
  }
})

// =========================================================================
// ROUTE LAYERS
//
// Robust layer management:
//   1. `ensureRouteLayers()` is idempotent — safe to call any time.
//   2. If the source exists but layers don't (or vice versa), we wipe
//      everything and re-add from scratch. This avoids a subtle bug where
//      a partial state after `setStyle()` left the route invisible.
//   3. Three stacked layers:
//        route-line-casing  → wide white casing (bottom)
//        route-line-solid   → blue active route (middle)
//        route-line-preview → dashed orange preview (top)
//      The casing makes the route pop on satellite and dark backgrounds.
// =========================================================================
function ensureRouteLayers() {
  if (!map.value) return

  // Wipe stale state — safe even if nothing exists.
  for (const id of ROUTE_LAYER_IDS) {
    if (map.value.getLayer(id)) {
      try { map.value.removeLayer(id) } catch {}
    }
  }
  if (map.value.getSource(ROUTE_SOURCE_ID)) {
    try { map.value.removeSource(ROUTE_SOURCE_ID) } catch {}
  }

  // Fresh source
  map.value.addSource(ROUTE_SOURCE_ID, {
    type: 'geojson',
    data: routeGeojson.value || { type: 'FeatureCollection', features: [] },
  })

  // Bottom: light casing around the active route
  map.value.addLayer({
    id: 'route-line-casing',
    type: 'line',
    source: ROUTE_SOURCE_ID,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
      visibility: 'none',
    },
    paint: {
      // Zoom-interpolated casing width — thin when zoomed out, thick when in.
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10, 8,
        14, 12,
        18, 16,
      ],
      'line-color': '#ffffff',
      'line-opacity': 0.92,
    },
  })

  // Middle: solid ocean-blue active route
  map.value.addLayer({
    id: 'route-line-solid',
    type: 'line',
    source: ROUTE_SOURCE_ID,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
      visibility: 'none',
    },
    paint: {
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10, 4,
        14, 6,
        18, 8,
      ],
      'line-color': '#0ea5e9',
      'line-opacity': 1,
    },
  })

  // Top: dashed sunset-orange preview route
  map.value.addLayer({
    id: 'route-line-preview',
    type: 'line',
    source: ROUTE_SOURCE_ID,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
      visibility: 'none',
    },
    paint: {
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10, 3,
        14, 5,
        18, 7,
      ],
      'line-color': '#fb923c',
      'line-opacity': 0.95,
      'line-dasharray': [2, 1.5],
    },
  })

  // Push current data + visibility immediately.
  drawRoute()
}

function updateRouteLayerVisibility() {
  if (!map.value) return
  const hasRoute = !!routeGeojson.value
  const isActive = routeMode.value === 'active'
  const isPreview = routeMode.value === 'preview'

  const casingVis = hasRoute && isActive ? 'visible' : 'none'
  const solidVis = hasRoute && isActive ? 'visible' : 'none'
  const previewVis = hasRoute && isPreview ? 'visible' : 'none'

  if (map.value.getLayer('route-line-casing')) {
    map.value.setLayoutProperty('route-line-casing', 'visibility', casingVis)
  }
  if (map.value.getLayer('route-line-solid')) {
    map.value.setLayoutProperty('route-line-solid', 'visibility', solidVis)
  }
  if (map.value.getLayer('route-line-preview')) {
    map.value.setLayoutProperty('route-line-preview', 'visibility', previewVis)
  }
}

function drawRoute() {
  if (!map.value) return
  const src = map.value.getSource(ROUTE_SOURCE_ID)
  if (!src) return

  src.setData(
    routeGeojson.value || { type: 'FeatureCollection', features: [] }
  )
  updateRouteLayerVisibility()
}

watch(routeMode, () => updateRouteLayerVisibility())

// =========================================================================
// ROUTE FETCH
// =========================================================================
async function fetchRoute(fromLngLat, toLngLat) {
  if (routeAbortController) routeAbortController.abort()

  const controller = new AbortController()
  routeAbortController = controller

  routeLoading.value = true
  routeError.value = ''
  routeMeta.value = null
  routeGeojson.value = null
  drawRoute()

  const [fromLng, fromLat] = fromLngLat
  const [toLng, toLat] = toLngLat

  const url =
    `${OSRM_BASE}/${fromLng},${fromLat};${toLng},${toLat}` +
    `?overview=full&geometries=geojson&steps=false&annotations=false`

  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    if (!data.routes || !data.routes.length) throw new Error('No route found')

    if (routeAbortController !== controller) return

    const route = data.routes[0]

    routeGeojson.value = {
      type: 'Feature',
      geometry: route.geometry,
      properties: {},
    }
    routeMeta.value = {
      distance: route.distance,
      duration: route.duration,
    }
    drawRoute()
  } catch (e) {
    if (e.name === 'AbortError') return
    if (routeAbortController !== controller) return

    console.error('[ResponderMapTab] route fetch failed', e)
    routeError.value = 'Could not calculate route.'
    routeGeojson.value = null
    routeMeta.value = null
    drawRoute()
  } finally {
    if (routeAbortController === controller) {
      routeLoading.value = false
      routeAbortController = null
    }
  }
}

function clearRoute() {
  if (routeAbortController) {
    routeAbortController.abort()
    routeAbortController = null
  }
  routeGeojson.value = null
  routeMeta.value = null
  routeError.value = ''
  routeLoading.value = false
  drawRoute()
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

function changeStyle(key) {
  if (!map.value) return
  const option = STYLE_OPTIONS.find((o) => o.key === key)
  if (!option) return

  currentStyleKey.value = key
  localStorage.setItem(STORAGE_KEY, key)

  // Track whether the new style has settled.
  let settled = false
  const rehydrate = () => {
    if (settled || !map.value) return
    if (!map.value.isStyleLoaded()) return
    settled = true

    if (userPosition.value) {
      dropUserMarker(userPosition.value.lng, userPosition.value.lat)
    }
    for (const m of incidentMarkers.values()) m.remove()
    incidentMarkers.clear()
    renderIncidentMarkers()

    ensureRouteLayers()
  }

  map.value.setStyle(option.style)

  // `styledata` fires many times during load; `idle` fires once when the
  // style is fully settled. We attach both as belt-and-braces — whichever
  // fires first with a loaded style wins, the flag prevents double-run.
  map.value.once('styledata', rehydrate)
  map.value.once('idle', rehydrate)

  // Safety net: if neither fires within 2s, force a rehydrate attempt.
  setTimeout(rehydrate, 2000)

  showStylePicker.value = false
}

function closeIncidentSheet() {
  selectedIncidentId.value = null
  acceptError.value = ''
  clearRoute()
}

function fitUserAndIncident(incident) {
  if (!map.value || !incident?.location) return

  const points = [
    [incident.location.longitude, incident.location.latitude],
  ]
  if (userPosition.value) {
    points.push([userPosition.value.lng, userPosition.value.lat])
  }

  if (points.length === 1) {
    map.value.flyTo({
      center: points[0],
      zoom: 17,
      duration: 700,
      essential: true,
    })
    return
  }

  const bounds = new maplibregl.LngLatBounds()
  points.forEach((p) => bounds.extend(p))

  map.value.fitBounds(bounds, {
    padding: {
      top: 90,
      bottom: 260,
      left: 60,
      right: 60,
    },
    duration: 800,
    maxZoom: 16,
  })
}

function openDetail(id) {
  if (!id) return

  selectedIncidentId.value = id
  acceptError.value = ''
  routeError.value = ''

  const inc = selectedIncident.value
  if (!inc) return

  fitUserAndIncident(inc)

  if (inc._group === 'other') {
    clearRoute()
    return
  }

  if (userPosition.value && inc.location) {
    fetchRoute(
      [userPosition.value.lng, userPosition.value.lat],
      [inc.location.longitude, inc.location.latitude]
    )
  } else if (!userPosition.value) {
    routeError.value = 'Enable location to see the route.'
  }
}

async function onAcceptFromSheet() {
  const inc = selectedIncident.value
  if (!inc || acceptingId.value) return

  const id = inc.id
  acceptingId.value = id
  acceptError.value = ''

  optimisticAcceptedIds.value = new Set([
    ...optimisticAcceptedIds.value,
    id,
  ])

  try {
    await acceptIncident(id, {
      uid: auth.user?.uid,
      fullName: auth.profile?.fullName || '',
    })
  } catch (e) {
    console.error('[ResponderMapTab] accept failed', e)
    acceptError.value = 'Could not accept. Try again.'

    const next = new Set(optimisticAcceptedIds.value)
    next.delete(id)
    optimisticAcceptedIds.value = next
  } finally {
    acceptingId.value = null
  }
}

function openExternalNavigation() {
  const inc = selectedIncident.value
  if (!inc?.location) return
  const lat = inc.location.latitude
  const lng = inc.location.longitude
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
  window.open(url, '_blank', 'noopener')
}

// =========================================================================
// HELPERS
// =========================================================================
const TYPE_LABELS = {
  flat_tire: 'Flat Tire',
  battery: 'Dead Battery',
  fuel: 'Out of Fuel',
  stalled_vehicle: 'Stalled Vehicle',
  minor_collision: 'Minor Crash',
  major_collision: 'Major Crash',
  vehicle_fire: 'Vehicle Fire',
  road_hazard: 'Road Hazard',
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

function formatDuration(seconds) {
  if (seconds == null) return '—'
  const mins = Math.round(seconds / 60)
  if (mins < 1) return '<1 min'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}
</script>

<template>
  <section class="map-tab">
    <div ref="mapContainer" class="map-canvas" />

    <Transition name="fade">
      <div v-if="loading" class="loading-overlay">
        <div class="loading-spinner" aria-hidden="true" />
        <p class="loading-text">Loading map…</p>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="loadError" class="error-overlay">
        <p class="error-text">{{ loadError }}</p>
        <button class="btn btn--soft" @click="() => location.reload()">
          Retry
        </button>
      </div>
    </Transition>

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
      <div class="legend-item legend-item--route">
        <span class="legend-line legend-line--active" />
        <span>Route (active)</span>
      </div>
      <div class="legend-item legend-item--route">
        <span class="legend-line legend-line--preview" />
        <span>Route (preview)</span>
      </div>
    </div>

    <button
      class="attrib-btn"
      aria-label="Map attribution"
      @click="showAttrib = true"
    >
      ©
    </button>

    <Transition name="sheet">
      <div
        v-if="selectedIncident"
        class="sheet-root"
        role="dialog"
        aria-modal="true"
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
            <div v-if="routeLoading" class="route-card route-card--loading">
              <div class="route-spinner" aria-hidden="true" />
              <span class="tiny">Calculating fastest route…</span>
            </div>

            <div v-else-if="routeMeta" class="route-card">
              <div class="route-stat">
                <span class="route-stat-icon" aria-hidden="true">📏</span>
                <div>
                  <p class="route-stat-label">Distance</p>
                  <p class="route-stat-value">
                    {{ formatDistance(routeMeta.distance) }}
                  </p>
                </div>
              </div>
              <div class="route-stat">
                <span class="route-stat-icon" aria-hidden="true">🕒</span>
                <div>
                  <p class="route-stat-label">Est. drive</p>
                  <p class="route-stat-value">
                    {{ formatDuration(routeMeta.duration) }}
                  </p>
                </div>
              </div>
            </div>

            <p v-else-if="routeError" class="route-error">
              {{ routeError }}
            </p>

            <p v-if="selectedIncident.description" class="sheet-desc">
              {{ selectedIncident.description }}
            </p>

            <div class="sheet-row">
              <span class="sheet-label">Barangay</span>
              <span class="sheet-value">
                {{ selectedIncident.barangay || '—' }}
              </span>
            </div>

            <div v-if="selectedIncident.citizenName" class="sheet-row">
              <span class="sheet-label">Reported by</span>
              <span class="sheet-value">{{ selectedIncident.citizenName }}</span>
            </div>

            <div
              v-if="selectedIncident.status !== 'pending'"
              class="sheet-row"
            >
              <span class="sheet-label">Status</span>
              <span class="sheet-value">
                {{ statusLabel(selectedIncident.status) }}
              </span>
            </div>

            <p v-if="acceptError" class="error-text">{{ acceptError }}</p>
          </div>

          <footer class="sheet-foot">
            <template v-if="selectedIncident._group === 'pending'">
              <button class="btn btn--ghost" @click="closeIncidentSheet">
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

            <template v-else-if="selectedIncident._group === 'mine'">
              <button class="btn btn--ghost" @click="closeIncidentSheet">
                Close
              </button>
              <button
                v-if="selectedIncident.location"
                class="btn btn--primary"
                @click="openExternalNavigation"
              >
                🧭 Navigate
              </button>
            </template>

            <template v-else>
              <button
                class="btn btn--primary"
                @click="closeIncidentSheet"
              >
                Close
              </button>
            </template>
          </footer>
        </div>
      </div>
    </Transition>

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

    <Transition name="fade">
      <div v-if="showAttrib" class="attrib-overlay" @click="showAttrib = false">
        <div class="attrib-card" @click.stop>
          <p class="attrib-title">Map data</p>
          <p class="attrib-text">
            © <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>
            · © <a href="https://www.openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a>
            · Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
            · Routing by <a href="http://project-osrm.org/" target="_blank" rel="noopener">OSRM</a>
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

.ctrl-btn:active { transform: scale(0.92); }
.ctrl-btn--active { color: var(--primary-light); border-color: var(--primary-light); }

.legend {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  left: 12px;
  background: rgba(10, 22, 40, 0.72);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  border: 1px solid var(--glass-border-strong);
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

.legend-item--route {
  margin-top: 2px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
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

.legend-line {
  width: 16px;
  height: 3px;
  border-radius: 2px;
  flex-shrink: 0;
}
.legend-line--active { background: #0ea5e9; }
.legend-line--preview {
  background: repeating-linear-gradient(
    90deg,
    #fb923c 0 4px,
    transparent 4px 7px
  );
}

.attrib-btn {
  position: absolute;
  left: 12px;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 88px);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(10, 22, 40, 0.72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
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
  background: rgba(255, 255, 255, 0.14);
  border-radius: 99px;
  margin: 8px auto 4px;
}

.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 20px 12px;
  border-bottom: 1px solid var(--glass-border);
}

.sheet-close {
  width: 36px;
  height: 36px;
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
  padding: 16px 20px;
}

.route-card {
  display: flex;
  gap: 10px;
  padding: 12px;
  margin-bottom: 16px;
  background: linear-gradient(
    135deg,
    rgba(14, 165, 233, 0.14) 0%,
    rgba(251, 146, 60, 0.08) 100%
  );
  border: 1px solid rgba(14, 165, 233, 0.28);
  border-radius: var(--radius);
}

.route-card--loading {
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  padding: 16px;
}

.route-spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-top-color: var(--accent-light);
  animation: spin 0.7s linear infinite;
  margin-right: 8px;
}

.route-stat {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.route-stat-icon {
  font-size: 1.125rem;
  line-height: 1;
  flex-shrink: 0;
}

.route-stat-label {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.route-stat-value {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1.2;
}

.route-error {
  font-size: 0.8125rem;
  color: var(--text-dim);
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: var(--radius);
  margin-bottom: 16px;
  text-align: center;
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
  border-top: 1px solid var(--glass-border);
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
  border-top: 1px solid var(--glass-border);
}

.sheet-foot .btn { flex: 1; }
.sheet-foot .btn--ghost { flex: 0.6; }

.btn--accept {
  background: linear-gradient(
    135deg,
    #38bdf8 0%,
    #0ea5e9 55%,
    #0284c7 100%
  );
  color: #fff;
  font-weight: 700;
  box-shadow: 0 4px 14px rgba(14, 165, 233, 0.4);
}

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
  background: linear-gradient(
    160deg,
    rgba(20, 41, 67, 0.96) 0%,
    rgba(10, 22, 40, 0.96) 100%
  );
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid var(--glass-border-strong);
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
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--glass-border-strong);
}

.style-preview {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  flex-shrink: 0;
  border: 1px solid var(--glass-border);
}

.style-body { display: flex; flex-direction: column; min-width: 0; flex: 1; }

.style-label { font-size: 0.875rem; font-weight: 650; }

.style-check { color: var(--accent-light); flex-shrink: 0; }

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
  background: linear-gradient(
    160deg,
    rgba(20, 41, 67, 0.96) 0%,
    rgba(10, 22, 40, 0.96) 100%
  );
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid var(--glass-border-strong);
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

.attrib-text a { color: var(--primary-light); text-decoration: underline; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>

<!-- ============================================================
     GLOBAL STYLES (unscoped)
     ============================================================ -->
<style>
.user-marker-dot {
  position: absolute;
  top: 0;
  left: 0;
  width: 20px;
  height: 20px;
  box-sizing: border-box;
  margin: -10px 0 0 -10px;
  border-radius: 50%;
  background: #2f9e73;
  border: 3px solid #ffffff;
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.35),
    0 0 0 0 rgba(47, 158, 115, 0.65);
  animation: user-marker-pulse 2.4s ease-out infinite;
  pointer-events: none;
}

@keyframes user-marker-pulse {
  0% {
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.35),
      0 0 0 0 rgba(47, 158, 115, 0.65);
  }
  70%,
  100% {
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.35),
      0 0 0 22px rgba(47, 158, 115, 0);
  }
}

.incident-marker {
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

.incident-marker--pending { --pin: #e63946; }
.incident-marker--mine    { --pin: #2f9e73; }
.incident-marker--other   { --pin: #f59e0b; }

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

.incident-marker--other .incident-marker__pulse {
  display: none;
}

.incident-marker--mine .incident-marker__pulse {
  animation-duration: 1.4s;
}

.incident-marker:focus-visible .incident-marker__icon {
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.6),
              0 4px 10px rgba(0, 0, 0, 0.4);
}
</style>