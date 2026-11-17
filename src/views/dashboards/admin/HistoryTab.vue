
<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  collection,
  documentId,
  getDocs,
  query,
  where,
} from 'firebase/firestore'

import { db } from '@/firebase'
import { getIncidentIcon, getIncidentLabel } from '@/utils/incidentTypes'
import AiAssessment from '@/components/AiAssessment.vue'
import MediaGallery from '@/components/MediaGallery.vue'
import { getAdminAnalytics } from '@/services/adminAnalytics'

// ============================================================
// FILTERS
// ============================================================

const fromDate = ref('')
const toDate = ref('')
const statusFilter = ref('')
const typeFilter = ref('')
const barangayFilter = ref('')

// ============================================================
// DATA
// ============================================================

const incidents = ref([])
const loading = ref(false)
const loadingAi = ref(false)
const error = ref('')
const aiError = ref('')
const total = ref(0)
const expandedId = ref(null)

let debounceTimer = null
let requestNumber = 0

// ============================================================
// FIRESTORE ENRICHMENT
// Retrieves AI, media, and additional incident details.
// Existing Firestore documents are read-only here.
// ============================================================

async function attachIncidentDetails(historyRecords) {
  const records = Array.isArray(historyRecords)
    ? historyRecords
    : []

  if (!records.length) return records

  loadingAi.value = true
  aiError.value = ''

  const detailsById = new Map()

  try {
    const ids = records.map(item => item.id).filter(Boolean)
    const chunks = []

    for (let i = 0; i < ids.length; i += 30) {
      chunks.push(ids.slice(i, i + 30))
    }

    const results = await Promise.all(
      chunks.map(chunk => {
        const incidentQuery = query(
          collection(db, 'incidents'),
          where(documentId(), 'in', chunk)
        )

        return getDocs(incidentQuery)
      })
    )

    results.forEach(snapshot => {
      snapshot.forEach(document => {
        const data = document.data()

        detailsById.set(document.id, {
          ml: data.ml || null,

          // Media fields used by the existing responder interface.
          photoUrls: Array.isArray(data.photoUrls)
            ? data.photoUrls
            : [],

          videoUrl: data.videoUrl || null,
          audioUrl: data.audioUrl || null,

          // Preserve additional information when available.
          location: data.location || null,
          type: data.type || null,
          reportedType: data.reportedType || null,
          severity: data.severity || null,
          description: data.description || null,
          barangay: data.barangay || null,
        })
      })
    })

    return records.map(item => {
      const details = detailsById.get(item.id) || {}

      return {
        ...item,
        ...details,

        // Prefer the API values when present.
        // Firestore supplies the missing details.
        ml: details.ml || null,
        photoUrls: details.photoUrls || [],
        videoUrl: details.videoUrl || null,
        audioUrl: details.audioUrl || null,
      }
    })
  } catch (err) {
    console.error(
      '[Admin History] Could not retrieve incident details:',
      err
    )

    aiError.value =
      'Some incident details or media could not be retrieved. Check Firebase read permissions.'

    return records.map(item => ({
      ...item,
      ml: null,
      photoUrls: [],
      videoUrl: null,
      audioUrl: null,
    }))
  } finally {
    loadingAi.value = false
  }
}

// ============================================================
// FETCH HISTORY FROM EXISTING BACKEND
// GET /analytics/history
// ============================================================

async function fetchHistory() {
  const currentRequest = ++requestNumber

  loading.value = true
  error.value = ''
  aiError.value = ''

  try {
    const params = { limit: 500 }

    if (fromDate.value) params.from = fromDate.value
    if (toDate.value) params.to = toDate.value
    if (statusFilter.value) params.status = statusFilter.value
    if (typeFilter.value) params.type = typeFilter.value

    if (barangayFilter.value.trim()) {
      params.barangay = barangayFilter.value.trim()
    }

    const data = await getAdminAnalytics('history', params)

    if (currentRequest !== requestNumber) return

    const historyRecords = Array.isArray(data.incidents)
      ? data.incidents
      : []

    total.value = Number(data.total || 0)

    // Display the backend records immediately.
    incidents.value = historyRecords.map(item => ({
      ...item,
      ml: null,
      photoUrls: [],
      videoUrl: null,
      audioUrl: null,
    }))

    // Enrich records using existing Firestore documents.
    const enrichedRecords = await attachIncidentDetails(
      historyRecords
    )

    if (currentRequest !== requestNumber) return

    incidents.value = enrichedRecords
  } catch (err) {
    console.error('[Admin History] Failed to load:', err)

    if (currentRequest === requestNumber) {
      error.value =
        err?.message || 'Could not load incident history.'

      incidents.value = []
      total.value = 0
    }
  } finally {
    if (currentRequest === requestNumber) {
      loading.value = false
    }
  }
}

// ============================================================
// FILTER WATCHER
// ============================================================

watch(
  [fromDate, toDate, statusFilter, typeFilter, barangayFilter],
  () => {
    if (debounceTimer) clearTimeout(debounceTimer)

    debounceTimer = setTimeout(fetchHistory, 350)
  }
)

onMounted(fetchHistory)

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  requestNumber++
})

// ============================================================
// DATE PRESETS
// ============================================================

function presetDays(days) {
  const to = new Date()
  const from = new Date()

  from.setDate(from.getDate() - days)

  toDate.value = to.toISOString().slice(0, 10)
  fromDate.value = from.toISOString().slice(0, 10)
}

function clearDateFilters() {
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

const hasFilters = computed(() => Boolean(
  fromDate.value ||
  toDate.value ||
  statusFilter.value ||
  typeFilter.value ||
  barangayFilter.value
))

// ============================================================
// FORMATTERS
// ============================================================

function typeLabel(type) {
  if (!type) return 'Unknown incident'

  return getIncidentLabel(type) ||
    String(type).replaceAll('_', ' ')
}

function typeIcon(type) {
  return getIncidentIcon(type) || '🚨'
}

function formatDateTime(value) {
  if (!value) return '—'

  let date

  if (typeof value?.toDate === 'function') {
    date = value.toDate()
  } else {
    date = new Date(value)
  }

  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || seconds === '') {
    return '—'
  }

  const value = Number(seconds)

  if (!Number.isFinite(value) || value < 0) return '—'

  if (value < 60) return `${Math.round(value)} seconds`

  if (value < 3600) {
    return `${(value / 60).toFixed(1)} minutes`
  }

  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)

  return `${hours}h ${minutes}m`
}

function statusTone(status) {
  const value = String(status || '').toLowerCase()

  return {
    unverified: 'warning',
    pending: 'warning',
    accepted: 'active',
    en_route: 'active',
    on_scene: 'active',
    resolved: 'resolved',
    cancelled: 'cancelled',
  }[value] || 'muted'
}

function severityTone(severity) {
  const value = String(severity || '').toLowerCase()

  return {
    low: 'low',
    medium: 'medium',
    high: 'high',
    critical: 'critical',
  }[value] || 'unknown'
}

function statusLabel(status) {
  return String(status || 'Unknown')
    .replaceAll('_', ' ')
}

function isEmergency(incident) {
  return String(incident.type || '').toLowerCase() === 'emergency' ||
    String(incident.reportedType || '').toLowerCase() === 'emergency'
}

// ============================================================
// INCIDENT DETAILS
// ============================================================

function toggleRow(id) {
  expandedId.value = expandedId.value === id ? null : id
}

function mediaCount(incident) {
  return Array.isArray(incident.photoUrls)
    ? incident.photoUrls.length
    : Number(incident.photoCount || 0)
}

// ============================================================
// SUMMARY
// ============================================================

const resolvedCount = computed(() =>
  incidents.value.filter(
    item => String(item.status).toLowerCase() === 'resolved'
  ).length
)

const pendingCount = computed(() =>
  incidents.value.filter(item =>
    ['pending', 'unverified'].includes(
      String(item.status).toLowerCase()
    )
  ).length
)

const withMediaCount = computed(() =>
  incidents.value.filter(item =>
    mediaCount(item) > 0 || item.videoUrl || item.hasVideo
  ).length
)

const aiAnalyzedCount = computed(() =>
  incidents.value.filter(item =>
    item.ml && Object.keys(item.ml).length > 0
  ).length
)

// ============================================================
// CSV EXPORT
// ============================================================

function csvEscape(value) {
  if (value === null || value === undefined) return ''

  const text = String(value)

  if (
    text.includes(',') ||
    text.includes('"') ||
    text.includes('\n')
  ) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}

function exportCSV() {
  if (!incidents.value.length) return

  const headers = [
    'Incident ID',
    'Created At',
    'Reported Type',
    'AI Predicted Type',
    'AI Predicted Severity',
    'AI Confidence',
    'AI Analysis Status',
    'Human Review Required',
    'Category Match',
    'Status',
    'Barangay',
    'Citizen Name',
    'Citizen Phone',
    'Responder',
    'Acknowledged At',
    'Resolved At',
    'Response Time Seconds',
    'Resolution Duration Seconds',
    'Photo Count',
    'Has Video',
    'Description',
  ]

  const rows = incidents.value.map(item => {
    const ml = item.ml || {}

    return [
      item.id,
      item.createdAt,
      item.reportedType,
      ml.predictedType,
      ml.predictedSeverity,
      ml.confidence,
      ml.analysisStatus,
      ml.needsHumanReview,
      ml.reportedTypeMatches,
      item.status,
      item.barangay,
      item.citizenName,
      item.citizenPhone,
      item.responderName,
      item.acknowledgedAt,
      item.resolvedAt,
      item.responseTimeSeconds,
      item.respondedDurationSeconds,
      item.photoCount,
      item.hasVideo ? 'Yes' : 'No',
      item.description,
    ]
  })

  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map(row => row.map(csvEscape).join(',')),
  ].join('\n')

  const blob = new Blob(
    ['\ufeff' + csv],
    { type: 'text/csv;charset=utf-8' }
  )

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download =
    `roadrescue-history-${new Date().toISOString().slice(0, 10)}.csv`

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="history-tab">

    <!-- HEADER -->
    <header class="head">
      <div>
        <div class="admin-label">
          <span class="admin-dot"></span>
          ADMIN RECORDS
        </div>

        <h1 class="h1">Incident History</h1>

        <p class="muted">
          Complete incident records, responder activity and AI assessments.
        </p>
      </div>

      <div class="header-actions">
        <button
          class="refresh-btn"
          type="button"
          :disabled="loading"
          @click="fetchHistory"
        >
          ↻ Refresh
        </button>

        <button
          class="export-btn"
          type="button"
          :disabled="!incidents.length"
          @click="exportCSV"
        >
          ↓ Export CSV
        </button>
      </div>
    </header>

    <!-- SUMMARY -->
    <div class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">Total incidents</span>
        <strong class="summary-number">{{ total }}</strong>
        <span class="summary-description">Matching records</span>
      </article>

      <article class="summary-card">
        <span class="summary-label">Resolved</span>
        <strong class="summary-number success">
          {{ resolvedCount }}
        </strong>
        <span class="summary-description">Displayed records</span>
      </article>

      <article class="summary-card">
        <span class="summary-label">Pending / unverified</span>
        <strong class="summary-number warning">
          {{ pendingCount }}
        </strong>
        <span class="summary-description">Displayed records</span>
      </article>

      <article class="summary-card">
        <span class="summary-label">AI assessed</span>
        <strong class="summary-number ai-number">
          {{ aiAnalyzedCount }}
        </strong>
        <span class="summary-description">
          {{ loadingAi ? 'Checking...' : 'Stored AI results' }}
        </span>
      </article>
    </div>

    <!-- ADDITIONAL SUMMARY -->
    <div class="media-overview">
      <span>📷 {{ withMediaCount }} incidents with submitted media</span>
      <span>🤖 {{ aiAnalyzedCount }} AI assessments available</span>
    </div>

    <!-- DATE PRESETS -->
    <div class="preset-row">
      <button class="preset-chip" @click="presetDays(7)">
        Last 7 days
      </button>

      <button class="preset-chip" @click="presetDays(30)">
        Last 30 days
      </button>

      <button class="preset-chip" @click="presetDays(90)">
        Last 90 days
      </button>

      <button class="preset-chip" @click="clearDateFilters">
        Default date range
      </button>
    </div>

    <!-- FILTERS -->
    <div class="filters">
      <div class="date-field">
        <label for="history-from">From date</label>
        <input
          id="history-from"
          v-model="fromDate"
          type="date"
          class="filter-input"
        />
      </div>

      <div class="date-field">
        <label for="history-to">To date</label>
        <input
          id="history-to"
          v-model="toDate"
          type="date"
          class="filter-input"
        />
      </div>

      <div class="date-field">
        <label for="history-status">Status</label>
        <select
          id="history-status"
          v-model="statusFilter"
          class="filter-input"
        >
          <option value="">All statuses</option>
          <option value="unverified">Unverified</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="en_route">En route</option>
          <option value="on_scene">On scene</option>
          <option value="resolved">Resolved</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div class="date-field">
        <label for="history-type">Incident type</label>
        <select
          id="history-type"
          v-model="typeFilter"
          class="filter-input"
        >
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

      <div class="date-field">
        <label for="history-barangay">Barangay</label>
        <input
          id="history-barangay"
          v-model="barangayFilter"
          type="text"
          class="filter-input"
          placeholder="Search barangay..."
        />
      </div>

      <button
        v-if="hasFilters"
        class="clear-btn"
        type="button"
        @click="clearFilters"
      >
        Clear filters
      </button>
    </div>

    <!-- RESULT HEADING -->
    <div class="result-heading">
      <div>
        <h2>Incident records</h2>
        <p>
          {{ incidents.length }} displayed of {{ total }} matching records
        </p>
      </div>

      <span class="live-indicator">
        <span class="live-dot"></span>
        Backend data
      </span>
    </div>

    <!-- LOADING -->
    <div v-if="loading && !incidents.length" class="state-block">
      <div class="spinner"></div>
      <p>Loading incident history...</p>
    </div>

    <!-- ERROR -->
    <div
      v-else-if="error && !incidents.length"
      class="state-block error-state"
    >
      <div class="state-icon">⚠️</div>
      <h3>Unable to load history</h3>
      <p>{{ error }}</p>

      <button class="retry-btn" @click="fetchHistory">
        Try again
      </button>
    </div>

    <!-- EMPTY -->
    <div v-else-if="!incidents.length" class="state-block">
      <div class="state-icon">📋</div>
      <h3>No incidents found</h3>
      <p>Try changing your filters or date range.</p>

      <button
        v-if="hasFilters"
        class="retry-btn"
        @click="clearFilters"
      >
        Clear filters
      </button>
    </div>

    <!-- INCIDENT LIST -->
    <div v-else class="incident-list">

      <article
        v-for="incident in incidents"
        :key="incident.id"
        class="incident-card"
        :class="{
          expanded: expandedId === incident.id,
          emergency: isEmergency(incident),
          resolved: incident.status === 'resolved',
        }"
      >

        <!-- INCIDENT HEADER -->
        <button
          type="button"
          class="incident-header"
          :aria-expanded="expandedId === incident.id"
          @click="toggleRow(incident.id)"
        >
          <div class="incident-icon">
            {{ typeIcon(incident.type || incident.reportedType) }}
          </div>

          <div class="incident-main">
            <div class="incident-title-line">
              <strong>
                {{ typeLabel(incident.type || incident.reportedType) }}
              </strong>

              <span
                class="status-chip"
                :class="`status-${statusTone(incident.status)}`"
              >
                {{ statusLabel(incident.status) }}
              </span>

              <span v-if="isEmergency(incident)" class="sos-badge">
                SOS
              </span>

              <span v-if="incident.ml" class="ai-mini-badge">
                AI assessed
              </span>
            </div>

            <div class="incident-meta">
              <span>{{ formatDateTime(incident.createdAt) }}</span>

              <span v-if="incident.barangay">
                · 📍 {{ incident.barangay }}
              </span>
            </div>

            <div class="incident-preview">
              {{ incident.description || 'No description provided.' }}
            </div>
          </div>

          <span class="expand-icon">
            {{ expandedId === incident.id ? '−' : '+' }}
          </span>
        </button>

        <!-- EXPANDED DETAILS -->
        <div
          v-if="expandedId === incident.id"
          class="incident-details"
        >

          <!-- INCIDENT INFORMATION -->
          <section class="detail-section">
            <div class="section-heading">
              <span>📋</span>
              <h3>Incident information</h3>
            </div>

            <p class="description">
              {{ incident.description || 'No description provided.' }}
            </p>

            <div class="detail-grid">
              <div class="detail-item">
                <span>Incident ID</span>
                <strong class="mono">
                  {{ incident.id || '—' }}
                </strong>
              </div>

              <div class="detail-item">
                <span>Reported severity</span>
                <strong
                  class="severity-chip"
                  :class="`severity-${severityTone(incident.severity)}`"
                >
                  {{ incident.severity || 'Unknown' }}
                </strong>
              </div>

              <div class="detail-item">
                <span>Status</span>
                <strong>{{ statusLabel(incident.status) }}</strong>
              </div>

              <div class="detail-item">
                <span>Barangay</span>
                <strong>{{ incident.barangay || '—' }}</strong>
              </div>

              <div class="detail-item">
                <span>Reported type</span>
                <strong>{{ typeLabel(incident.reportedType) }}</strong>
              </div>

              <div class="detail-item">
                <span>AI predicted type</span>
                <strong>
                  {{ typeLabel(incident.ml?.predictedType || incident.type) }}
                </strong>
              </div>

              <div class="detail-item">
                <span>Submitted</span>
                <strong>{{ formatDateTime(incident.createdAt) }}</strong>
              </div>
            </div>
          </section>

          <!-- AI ASSESSMENT -->
          <section class="detail-section ai-detail-section">
            <div class="section-heading">
              <span>🤖</span>
              <div>
                <h3>AI Incident Assessment</h3>
                <p>Gemini analysis stored with this incident</p>
              </div>

              <span
                v-if="incident.ml"
                class="ai-available-badge"
              >
                <span></span>
                Available
              </span>
            </div>

            <AiAssessment
              v-if="incident.ml && Object.keys(incident.ml).length"
              :ml="incident.ml"
              :reported-type="
                incident.ml.reportedType ||
                incident.reportedType ||
                ''
              "
              audience="admin"
            />

            <div v-else class="no-ai-data">
              🧠
              <div>
                <strong>AI assessment unavailable</strong>
                <p>
                  No stored AI assessment was found for this incident.
                </p>
              </div>
            </div>
          </section>

          <!-- CITIZEN AND RESPONDER -->
          <section class="detail-section">
            <div class="section-heading">
              <span>👥</span>
              <h3>Response information</h3>
            </div>

            <div class="detail-grid">
              <div class="detail-item">
                <span>Citizen</span>
                <strong>{{ incident.citizenName || '—' }}</strong>
              </div>

              <div class="detail-item">
                <span>Citizen phone</span>
                <strong>{{ incident.citizenPhone || '—' }}</strong>
              </div>

              <div class="detail-item">
                <span>Assigned responder</span>
                <strong>{{ incident.responderName || '—' }}</strong>
              </div>

              <div class="detail-item">
                <span>Response time</span>
                <strong>
                  {{ formatDuration(incident.responseTimeSeconds) }}
                </strong>
              </div>

              <div class="detail-item">
                <span>Acknowledged at</span>
                <strong>
                  {{ formatDateTime(incident.acknowledgedAt) }}
                </strong>
              </div>

              <div class="detail-item">
                <span>Resolved at</span>
                <strong>
                  {{ formatDateTime(incident.resolvedAt) }}
                </strong>
              </div>

              <div class="detail-item">
                <span>Resolution duration</span>
                <strong>
                  {{ formatDuration(incident.respondedDurationSeconds) }}
                </strong>
              </div>
            </div>
          </section>

          <!-- MEDIA GALLERY -->
          <section class="detail-section">
            <div class="section-heading">
              <span>📸</span>
              <h3>Submitted evidence</h3>
            </div>

            <div class="media-summary">
              <div class="media-item">
                <span>📷</span>
                <div>
                  <strong>{{ mediaCount(incident) }}</strong>
                  <small>Photos</small>
                </div>
              </div>

              <div class="media-item">
                <span>🎥</span>
                <div>
                  <strong>
                    {{ incident.videoUrl ? 'Yes' : 'No' }}
                  </strong>
                  <small>Video submitted</small>
                </div>
              </div>
            </div>

            <MediaGallery
              v-if="incident.photoUrls?.length || incident.videoUrl"
              :photo-urls="incident.photoUrls || []"
              :video-url="incident.videoUrl || null"
              mode="compact"
              class="incident-media"
            />

            <div
              v-else-if="!incident.photoUrls?.length && !incident.videoUrl"
              class="no-media"
            >
              No accessible photo or video URLs were found for this incident.
            </div>
          </section>

          <!-- EMERGENCY AUDIO -->
          <section
            v-if="isEmergency(incident) && incident.audioUrl"
            class="detail-section audio-section"
          >
            <div class="section-heading">
              <span>🎤</span>
              <h3>Emergency voice recording</h3>
            </div>

            <audio
              :src="incident.audioUrl"
              controls
              preload="metadata"
              class="audio-player"
            >
              Your browser does not support audio playback.
            </audio>
          </section>

          <!-- ADMIN RECORD -->
          <section class="admin-record">
            <div>
              <span class="admin-record-icon">🛡️</span>
              <div>
                <strong>Administrator record</strong>
                <p>
                  Full incident information and administrative visibility.
                </p>
              </div>
            </div>

            <span class="admin-access">ADMIN ACCESS</span>
          </section>

        </div>
      </article>
    </div>

    <!-- FIRESTORE WARNING -->
    <div v-if="aiError" class="inline-error">
      {{ aiError }}
    </div>

    <!-- FOOTER -->
    <p v-if="incidents.length" class="footer-note">
      Displaying {{ incidents.length }} of {{ total }} matching incidents.
    </p>

  </section>
</template>

<style scoped>
.history-tab {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 24px;
  color: var(--text);
  min-width: 0;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}

.admin-label {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 7px;
  color: #60a5fa;
  font-size: 0.65rem;
  font-weight: 850;
  letter-spacing: 0.12em;
}

.admin-dot,
.live-dot {
  width: 8px;
  height: 8px;
  background: #16a34a;
  border-radius: 50%;
}

.h1 {
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.muted {
  margin-top: 5px;
  color: var(--text-muted);
  font-size: 0.85rem;
  line-height: 1.5;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.refresh-btn,
.export-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--border);
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
  transition: 0.2s;
}

.refresh-btn {
  background: var(--bg-elev);
  color: var(--text);
}

.export-btn {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.refresh-btn:disabled,
.export-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* SUMMARY */

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.summary-card {
  padding: 15px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--bg-elev);
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.summary-label {
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 650;
}

.summary-number {
  font-size: 1.65rem;
  font-weight: 850;
}

.summary-description {
  color: var(--text-dim);
  font-size: 0.68rem;
}

.success { color: #16a34a; }
.warning { color: #d97706; }
.ai-number { color: #38bdf8; }

.media-overview {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  color: var(--text-muted);
  font-size: 0.75rem;
}

/* FILTERS */

.preset-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.preset-chip {
  padding: 8px 13px;
  border-radius: 30px;
  border: 1px solid var(--border);
  background: var(--bg-elev);
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}

.preset-chip:hover {
  border-color: #3b82f6;
  color: #3b82f6;
}

.filters {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  padding: 15px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--bg-elev);
}

.date-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.date-field label {
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.filter-input {
  width: 100%;
  min-width: 0;
  min-height: 42px;
  padding: 9px 11px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 9px;
  color: var(--text);
  font-family: inherit;
  font-size: 0.82rem;
  outline: none;
}

.filter-input:focus {
  border-color: #3b82f6;
}

.clear-btn {
  align-self: end;
  min-height: 42px;
  padding: 8px 13px;
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 9px;
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
  font-weight: 700;
  cursor: pointer;
}

/* RESULT HEADER */

.result-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.result-heading h2 {
  font-size: 1rem;
  font-weight: 800;
}

.result-heading p {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 0.75rem;
}

.live-indicator {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 700;
}

/* STATES */

.state-block {
  padding: 38px 20px;
  text-align: center;
  border: 1px dashed var(--border);
  border-radius: 14px;
  background: var(--bg-elev);
}

.state-block h3 {
  margin: 8px 0 5px;
  font-size: 1rem;
}

.state-block p {
  color: var(--text-muted);
  font-size: 0.82rem;
  line-height: 1.5;
}

.state-icon {
  font-size: 2rem;
}

.spinner {
  width: 27px;
  height: 27px;
  margin: 0 auto 13px;
  border: 3px solid var(--border);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-state {
  border-color: rgba(239, 68, 68, 0.35);
}

.retry-btn {
  margin-top: 13px;
  padding: 9px 16px;
  border: none;
  border-radius: 9px;
  background: #2563eb;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

/* INCIDENT CARDS */

.incident-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.incident-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--bg-elev);
  transition: border-color 0.2s;
}

.incident-card.expanded {
  border-color: rgba(59, 130, 246, 0.55);
}

.incident-card.emergency {
  border-color: rgba(239, 68, 68, 0.45);
}

.incident-card.resolved {
  border-color: rgba(22, 163, 74, 0.3);
}

.incident-header {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 24px;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 15px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.incident-header:hover {
  background: var(--bg-input);
}

.incident-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 11px;
  background: var(--bg-input);
  font-size: 1.25rem;
}

.incident-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.incident-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}

.incident-title-line strong {
  font-size: 0.9rem;
}

.incident-meta {
  color: var(--text-muted);
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}

.incident-preview {
  color: var(--text-muted);
  font-size: 0.75rem;
  line-height: 1.45;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.expand-icon {
  color: var(--text-muted);
  font-size: 1.35rem;
  font-weight: 600;
  text-align: center;
}

.status-chip,
.severity-chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.63rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.status-warning {
  color: #d97706;
  background: rgba(245, 158, 11, 0.14);
}

.status-active {
  color: #2563eb;
  background: rgba(59, 130, 246, 0.14);
}

.status-resolved {
  color: #16a34a;
  background: rgba(34, 197, 94, 0.14);
}

.status-cancelled,
.status-muted {
  color: var(--text-muted);
  background: var(--bg-input);
}

.sos-badge {
  padding: 4px 8px;
  border-radius: 5px;
  background: #dc2626;
  color: #fff;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.ai-mini-badge {
  padding: 4px 7px;
  border-radius: 6px;
  background: rgba(14, 165, 233, 0.12);
  color: #38bdf8;
  font-size: 0.61rem;
  font-weight: 800;
  text-transform: uppercase;
}

/* EXPANDED DETAILS */

.incident-details {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 17px;
  border-top: 1px solid var(--border);
  animation: reveal 0.2s ease;
  min-width: 0;
}

@keyframes reveal {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.detail-section {
  min-width: 0;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 13px;
}

.section-heading > span {
  font-size: 1.05rem;
}

.section-heading h3 {
  font-size: 0.85rem;
  font-weight: 800;
}

.section-heading p {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 0.7rem;
}

.description {
  margin-bottom: 15px;
  padding: 12px;
  border-radius: 9px;
  background: var(--bg-input);
  color: var(--text-muted);
  font-size: 0.82rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px 12px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.detail-item span {
  color: var(--text-muted);
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
}

.detail-item strong {
  font-size: 0.79rem;
  overflow-wrap: anywhere;
}

.mono {
  font-family: monospace;
  font-size: 0.7rem !important;
}

/* SEVERITY */

.severity-low {
  color: #16a34a;
  background: rgba(34, 197, 94, 0.13);
}

.severity-medium {
  color: #d97706;
  background: rgba(245, 158, 11, 0.13);
}

.severity-high {
  color: #dc2626;
  background: rgba(239, 68, 68, 0.13);
}

.severity-critical {
  color: #fff;
  background: #dc2626;
}

.severity-unknown {
  color: var(--text-muted);
  background: var(--bg-input);
}

/* AI */

.ai-detail-section {
  padding: 15px;
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 12px;
  background: rgba(14, 165, 233, 0.035);
}

.ai-detail-section .section-heading {
  flex-wrap: wrap;
}

.ai-detail-section .section-heading > div {
  flex: 1;
  min-width: 0;
}

.ai-detail-section .section-heading h3 {
  color: #38bdf8;
}

.ai-available-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #16a34a;
  font-size: 0.68rem;
  font-weight: 750;
}

.ai-available-badge span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #16a34a;
}

.no-ai-data {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: var(--bg-input);
}

.no-ai-data strong {
  font-size: 0.8rem;
}

.no-ai-data p {
  margin-top: 5px;
  color: var(--text-muted);
  font-size: 0.73rem;
  line-height: 1.5;
}

/* MEDIA */

.media-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 13px;
}

.media-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 125px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-input);
}

.media-item > span {
  font-size: 1.4rem;
}

.media-item div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.media-item strong {
  font-size: 0.9rem;
}

.media-item small {
  color: var(--text-muted);
  font-size: 0.68rem;
}

.incident-media {
  display: block;
  width: 100%;
  margin-top: 12px;
}

.no-media {
  padding: 14px;
  border: 1px dashed var(--border);
  border-radius: 9px;
  color: var(--text-muted);
  font-size: 0.75rem;
  line-height: 1.5;
}

/* AUDIO */

.audio-section {
  padding: 15px;
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.035);
}

.audio-player {
  width: 100%;
  max-width: 100%;
}

/* ADMIN RECORD */

.admin-record {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 11px;
  background: rgba(59, 130, 246, 0.06);
}

.admin-record > div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.admin-record-icon {
  font-size: 1.35rem;
}

.admin-record strong {
  font-size: 0.78rem;
}

.admin-record p {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 0.7rem;
}

.admin-access {
  padding: 5px 8px;
  border-radius: 6px;
  background: rgba(59, 130, 246, 0.14);
  color: #60a5fa;
  font-size: 0.6rem;
  font-weight: 850;
}

/* WARNINGS */

.inline-error {
  padding: 10px 13px;
  border-radius: 9px;
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
  font-size: 0.75rem;
  line-height: 1.5;
}

.footer-note {
  color: var(--text-dim);
  text-align: center;
  font-size: 0.73rem;
}

/* TABLET */

@media (min-width: 650px) {
  .summary-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .detail-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

/* DESKTOP */

@media (min-width: 1024px) {
  .h1 {
    font-size: 2rem;
  }

  .filters {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    align-items: end;
  }

  .detail-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .incident-header {
    padding: 17px 20px;
  }

  .incident-details {
    padding: 20px;
  }
}

/* MOBILE */

@media (max-width: 480px) {
  .head {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
  }

  .header-actions button {
    flex: 1;
  }

  .incident-header {
    grid-template-columns: 36px minmax(0, 1fr) 20px;
    gap: 9px;
    padding: 12px;
  }

  .incident-icon {
    width: 36px;
    height: 36px;
    font-size: 1.1rem;
  }

  .incident-details {
    padding: 13px;
  }

  .detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .media-summary {
    gap: 8px;
  }

  .media-item {
    min-width: 0;
    flex: 1;
  }
}
</style>
