<script setup>
import { ref, computed } from 'vue'
import {
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import {
  useIncidents,
  STATUS_GROUPS,
} from '@/composables/useIncidents'
import MediaGallery from '@/components/MediaGallery.vue'
import { searchBarangays } from '@/data/barangays'

const auth = useAuthStore()

const { incidents: unverified, loading } = useIncidents({
  statuses: STATUS_GROUPS.UNVERIFIED,
  scope: 'all',
})

const viewMode = ref('list')
const selectedIncident = ref(null)

const searchQuery = ref('')

const filtered = computed(() => {
  if (!searchQuery.value.trim()) return unverified.value
  const q = searchQuery.value.toLowerCase()
  return unverified.value.filter((inc) =>
    (inc.type || '').toLowerCase().includes(q) ||
    (inc.description || '').toLowerCase().includes(q) ||
    (inc.barangay || '').toLowerCase().includes(q) ||
    (inc.citizenName || '').toLowerCase().includes(q)
  )
})

const TYPE_ICONS = {
  flat_tire: '🛞', battery: '🔋', fuel: '⛽',
  stalled_vehicle: '🛑', minor_collision: '🚗', major_collision: '💥',
  vehicle_fire: '🔥', road_hazard: '⚠️', emergency: '🚨',
}
const TYPE_LABELS = {
  flat_tire: 'Flat Tire', battery: 'Dead Battery', fuel: 'Out of Fuel',
  stalled_vehicle: 'Stalled Vehicle', minor_collision: 'Minor Crash',
  major_collision: 'Major Crash', vehicle_fire: 'Vehicle Fire',
  road_hazard: 'Road Hazard', emergency: 'Emergency (SOS)',
}

function typeIcon(t) { return TYPE_ICONS[t] || '❓' }
function typeLabel(t) { return TYPE_LABELS[t] || 'Incident' }

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

function severityTone(sev) {
  return { low: 'low', medium: 'medium', high: 'high', critical: 'critical' }[sev] || 'medium'
}

const isEmergency = computed(() =>
  selectedIncident.value?.type === 'emergency'
)

const detailBarangay = ref('')
const detailBarangayQuery = ref('')
const detailBarangayOpen = ref(false)
const barangayOverride = ref(false)
const filteredBarangays = computed(() => searchBarangays(detailBarangayQuery.value))

const assignedResponder = ref(null)
const assignedLoading = ref(false)

async function loadAssignedResponder(barangayName) {
  if (!barangayName) { assignedResponder.value = null; return }
  assignedLoading.value = true
  try {
    const slug = slugify(barangayName)
    const snap = await getDoc(doc(db, 'barangays', slug))
    if (snap.exists()) {
      const data = snap.data()
      assignedResponder.value = data.responderUid
        ? { uid: data.responderUid, name: data.responderName || '', phone: data.responderPhone || '' }
        : null
    } else assignedResponder.value = null
  } catch (e) {
    console.error('[VerifyTab] failed to load assigned responder', e)
    assignedResponder.value = null
  } finally { assignedLoading.value = false }
}

function slugify(name) {
  return name.toLowerCase().replace(/[()]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function openDetail(incident) {
  selectedIncident.value = incident
  detailBarangay.value = incident.barangay || ''
  detailBarangayQuery.value = ''
  detailBarangayOpen.value = false
  barangayOverride.value = false
  viewMode.value = 'detail'
  loadAssignedResponder(detailBarangay.value)
  window.scrollTo({ top: 0, behavior: 'instant' })
}

function closeDetail() {
  viewMode.value = 'list'
  selectedIncident.value = null
  assignedResponder.value = null
}

function pickBarangay(name) {
  detailBarangay.value = name
  detailBarangayOpen.value = false
  detailBarangayQuery.value = ''
  barangayOverride.value = true
  loadAssignedResponder(name)
}

const dispatching = ref(false)
const rejecting = ref(false)
const actionError = ref('')

const canDispatch = computed(() =>
  !!detailBarangay.value && !!assignedResponder.value &&
  !dispatching.value && !rejecting.value
)

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

async function onDispatch() {
  if (!canDispatch.value || !selectedIncident.value) return
  dispatching.value = true
  actionError.value = ''
  try {
    if (barangayOverride.value) {
      await updateDoc(doc(db, 'incidents', selectedIncident.value.id), {
        barangay: detailBarangay.value,
        updatedAt: serverTimestamp(),
      })
    }
    const resp = await fetch(`${API_URL}/dispatch-incident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incident_id: selectedIncident.value.id }),
    })
    const data = await resp.json()
    if (!resp.ok || !data.ok) {
      actionError.value = data.message || 'Dispatch failed. Try again.'
      return
    }
    closeDetail()
  } catch (e) {
    console.error('[VerifyTab] dispatch failed', e)
    actionError.value = 'Could not reach server. Try again.'
  } finally { dispatching.value = false }
}

async function onReject() {
  if (!selectedIncident.value) return
  if (!confirm('Reject this incident? It will not be sent to responders.')) return
  rejecting.value = true
  actionError.value = ''
  try {
    await updateDoc(doc(db, 'incidents', selectedIncident.value.id), {
      status: 'cancelled',
      cancelledBy: auth.user?.uid,
      cancelledByName: auth.profile?.fullName || '',
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    closeDetail()
  } catch (e) {
    console.error('[VerifyTab] reject failed', e)
    actionError.value = 'Could not reject. Try again.'
  } finally { rejecting.value = false }
}
</script>

<template>
  <section class="verify-tab">
    <!-- LIST VIEW -->
    <template v-if="viewMode === 'list'">
      <header class="head">
        <div>
          <h1 class="h1">Verify</h1>
          <p class="muted">
            Review incoming reports and dispatch them to responders.
          </p>
        </div>
      </header>

      <div v-if="unverified.length" class="count-banner">
        <span class="count-number">{{ unverified.length }}</span>
        <div class="count-body">
          <p class="count-title">
            {{ unverified.length === 1 ? 'incident needs' : 'incidents need' }}
            your review
          </p>
          <p class="count-text">
            Reports from citizens land here before responders can see them.
          </p>
        </div>
      </div>

      <div v-if="unverified.length > 1" class="search-wrap">
        <span class="search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </span>
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="Search by type, barangay, or name…"
        />
      </div>

      <div v-if="loading && !unverified.length" class="state-block">
        <div class="state-spinner" aria-hidden="true" />
        <p class="tiny">Loading queue…</p>
      </div>

      <div v-else-if="!unverified.length" class="state-block">
        <div class="state-icon" aria-hidden="true">✅</div>
        <p class="state-title">All caught up</p>
        <p class="tiny state-text">
          New citizen reports will appear here for verification.
        </p>
      </div>

      <div v-else-if="!filtered.length" class="state-block">
        <div class="state-icon" aria-hidden="true">🔍</div>
        <p class="state-title">No matches</p>
        <p class="tiny state-text">No incidents match "{{ searchQuery }}"</p>
      </div>

      <ul v-else class="list">
        <li
          v-for="inc in filtered"
          :key="inc.id"
          class="card"
          :class="{ 'card--emergency': inc.type === 'emergency' }"
          role="button"
          tabindex="0"
          @click="openDetail(inc)"
          @keydown.enter="openDetail(inc)"
        >
          <div class="card-head">
            <div class="card-type">
              <span class="card-type-icon" aria-hidden="true">
                {{ typeIcon(inc.type) }}
              </span>
              <div class="card-type-text">
                <span class="card-type-label">{{ typeLabel(inc.type) }}</span>
                <span v-if="inc.type === 'emergency'" class="card-type-sos">SOS</span>
                <span
                  v-if="inc.ml?.predictedType && inc.type !== 'emergency'"
                  class="card-type-pred"
                  :class="{
                    'card-type-pred--match': inc.ml.reportedTypeMatches,
                    'card-type-pred--mismatch': inc.ml.reportedTypeMatches === false,
                  }"
                >
                  ML: {{ typeLabel(inc.ml.predictedType) }}
                  <template v-if="inc.ml.confidence">
                    · {{ Math.round(inc.ml.confidence * 100) }}%
                  </template>
                </span>
              </div>
            </div>
            <span class="card-time tiny">{{ timeAgo(inc.createdAt) }}</span>
          </div>

          <p v-if="inc.description" class="card-desc">{{ inc.description }}</p>

          <div v-if="inc.type === 'emergency' && inc.audioUrl" class="card-audio-pill">
            <span aria-hidden="true">🎤</span>
            <span>Voice message</span>
          </div>

          <div class="card-meta">
            <span v-if="inc.barangay" class="card-meta-item">
              <span aria-hidden="true">📍</span> {{ inc.barangay }}
            </span>
            <span v-if="inc.citizenName" class="card-meta-item">
              <span aria-hidden="true">👤</span> {{ inc.citizenName }}
            </span>
          </div>

          <div class="card-actions-preview">
            <span class="tiny">Tap to review &amp; dispatch</span>
            <span class="tiny card-arrow" aria-hidden="true">→</span>
          </div>
        </li>
      </ul>
    </template>

    <!-- DETAIL VIEW -->
    <template v-else>
      <header class="head head--detail">
        <button class="back-btn" aria-label="Back to list" @click="closeDetail">
          <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
            <path d="m15 18-6-6 6-6" stroke="currentColor" stroke-width="2.5"
              stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <h1 class="h2">
          {{ isEmergency ? 'Review Emergency' : 'Review Incident' }}
        </h1>
      </header>

      <div v-if="selectedIncident" class="detail-layout">
        <!-- LEFT: media -->
        <div class="detail-col detail-col--media">
          <!-- Emergency audio (if any) -->
          <div v-if="isEmergency && selectedIncident.audioUrl" class="emergency-audio-card">
            <div class="emergency-audio-head">
              <span class="emergency-audio-icon" aria-hidden="true">🚨</span>
              <div>
                <p class="emergency-audio-label">Voice message from caller</p>
                <p class="tiny emergency-audio-meta">
                  {{ selectedIncident.audioDurationSeconds
                      ? `${selectedIncident.audioDurationSeconds} seconds`
                      : 'Recorded' }}
                </p>
              </div>
            </div>
            <audio
              :src="selectedIncident.audioUrl"
              controls
              class="emergency-audio-player"
              preload="metadata"
            />
          </div>

          <MediaGallery
            v-if="selectedIncident.photoUrls?.length || selectedIncident.videoUrl"
            :photo-urls="selectedIncident.photoUrls || []"
            :video-url="selectedIncident.videoUrl || null"
            mode="full"
          />
          <div v-else-if="!isEmergency || !selectedIncident.audioUrl" class="no-media">
            <div class="no-media-icon" aria-hidden="true">📷</div>
            <p class="tiny">No media attached to this report.</p>
          </div>
        </div>

        <!-- RIGHT: info + actions -->
        <div class="detail-col detail-col--info">
          <div class="detail-card">
            <div class="detail-row">
              <span class="detail-label">Type</span>
              <span class="detail-value">
                {{ typeIcon(selectedIncident.type) }}
                {{ typeLabel(selectedIncident.type) }}
              </span>
            </div>
            <div v-if="selectedIncident.description" class="detail-row">
              <span class="detail-label">Description</span>
              <span class="detail-value detail-value--multiline">
                {{ selectedIncident.description }}
              </span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Reported by</span>
              <span class="detail-value">{{ selectedIncident.citizenName || '—' }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Phone</span>
              <span class="detail-value">{{ selectedIncident.citizenPhone || '—' }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Submitted</span>
              <span class="detail-value">{{ timeAgo(selectedIncident.createdAt) }}</span>
            </div>
          </div>

          <div v-if="selectedIncident.ml && !isEmergency" class="detail-card detail-card--ml">
            <div class="ml-head">
              <span class="ml-badge">🤖 AI Analysis</span>
              <span v-if="selectedIncident.ml.reportedTypeMatches === true" class="ml-match">✓ Matches</span>
              <span v-else-if="selectedIncident.ml.reportedTypeMatches === false" class="ml-mismatch">⚠ Differs</span>
            </div>

            <div class="detail-row">
              <span class="detail-label">Predicted type</span>
              <span class="detail-value">{{ typeLabel(selectedIncident.ml.predictedType) }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Severity</span>
              <span class="severity-chip" :class="`severity-chip--${severityTone(selectedIncident.ml.predictedSeverity)}`">
                {{ selectedIncident.ml.predictedSeverity }}
              </span>
            </div>
            <div v-if="selectedIncident.ml.confidence" class="detail-row">
              <span class="detail-label">Confidence</span>
              <span class="detail-value">
                {{ Math.round(selectedIncident.ml.confidence * 100) }}%
                <span v-if="selectedIncident.ml.sources" class="tiny">
                  · {{ selectedIncident.ml.sources.join(', ') }}
                </span>
              </span>
            </div>
          </div>

          <div class="detail-card">
            <p class="detail-section-title">Dispatch to barangay</p>

            <div v-if="detailBarangay && !detailBarangayOpen" class="barangay-chip-row">
              <span class="barangay-chip-lg">
                <span aria-hidden="true">📍</span>
                {{ detailBarangay }}
                <button
                  type="button"
                  class="barangay-edit"
                  aria-label="Change barangay"
                  @click="detailBarangayOpen = true; detailBarangayQuery = ''"
                >Edit</button>
              </span>
              <p v-if="!barangayOverride" class="tiny">Auto-detected from citizen's GPS</p>
              <p v-else class="tiny barangay-override-note">Overridden by you</p>
            </div>

            <div v-else class="barangay-picker">
              <input
                v-model="detailBarangayQuery"
                type="text"
                class="input"
                placeholder="Search barangay…"
                @focus="detailBarangayOpen = true"
              />
              <ul v-if="detailBarangayQuery && filteredBarangays.length" class="barangay-list">
                <li
                  v-for="b in filteredBarangays.slice(0, 8)"
                  :key="b"
                  class="barangay-item"
                  @click="pickBarangay(b)"
                >{{ b }}</li>
              </ul>
            </div>

            <div class="responder-preview">
              <p class="detail-section-title">Assigned responder</p>

              <div v-if="assignedLoading" class="responder-loading">
                <div class="state-spinner state-spinner--sm" />
                <span class="tiny">Checking assignment…</span>
              </div>

              <div v-else-if="assignedResponder" class="responder-assigned">
                <span class="responder-icon" aria-hidden="true">👤</span>
                <div class="responder-body">
                  <p class="responder-name">{{ assignedResponder.name }}</p>
                  <p class="tiny">{{ assignedResponder.phone || 'No phone on file' }}</p>
                </div>
                <span class="responder-ok" aria-label="Assigned">✓</span>
              </div>

              <div v-else class="responder-missing">
                <span class="responder-icon" aria-hidden="true">⚠️</span>
                <div>
                  <p class="responder-name">No responder assigned</p>
                  <p class="tiny">Assign one in the Barangays tab before dispatching.</p>
                </div>
              </div>
            </div>
          </div>

          <p v-if="actionError" class="error-banner">{{ actionError }}</p>

          <div class="detail-actions">
            <button class="btn btn--ghost" :disabled="rejecting || dispatching" @click="onReject">
              {{ rejecting ? 'Rejecting…' : 'Reject' }}
            </button>
            <button class="btn btn--primary detail-dispatch" :disabled="!canDispatch" @click="onDispatch">
              {{
                dispatching ? 'Dispatching…'
                  : assignedResponder ? 'Verify & Dispatch'
                  : 'No Responder Assigned'
              }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.verify-tab {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.head { margin-bottom: 16px; }
.head .h1 { font-size: 1.5rem; }
.head .muted { margin-top: 4px; line-height: 1.5; }

.head--detail {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.back-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  color: var(--text);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}
.back-btn:active { transform: scale(0.92); }

.count-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background:
    radial-gradient(80% 100% at 0% 50%, rgba(59, 130, 246, 0.12) 0%, transparent 70%),
    var(--bg-elev);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: var(--radius);
  margin-bottom: 16px;
}
.count-number {
  font-size: 2rem;
  font-weight: 800;
  color: #3b82f6;
  line-height: 1;
  min-width: 40px;
}
.count-body { min-width: 0; flex: 1; }
.count-title { font-size: 0.9375rem; font-weight: 700; margin-bottom: 2px; }
.count-text { font-size: 0.75rem; color: var(--text-muted); line-height: 1.4; }

.search-wrap { position: relative; margin-bottom: 14px; }
.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-dim);
  pointer-events: none;
}
.search-input {
  width: 100%;
  min-height: 46px;
  padding: 12px 14px 12px 42px;
  font-size: 16px;
  background: var(--bg-input);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  outline: none;
  transition: border-color 0.15s ease;
}
.search-input:focus { border-color: #3b82f6; }

.state-block {
  background: var(--bg-elev);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  padding: 40px 24px;
  text-align: center;
}
.state-spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: #3b82f6;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}
.state-spinner--sm { width: 16px; height: 16px; border-width: 2px; margin: 0; }
@keyframes spin { to { transform: rotate(360deg); } }
.state-icon { font-size: 2rem; line-height: 1; margin-bottom: 10px; opacity: 0.8; }
.state-title { font-size: 0.9375rem; font-weight: 650; margin-bottom: 4px; }
.state-text { line-height: 1.5; max-width: 32ch; margin-inline: auto; }

.list {
  list-style: none;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.card {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  cursor: pointer;
  transition: all 0.15s ease;
  animation: card-in 0.24s ease;
}
.card:active {
  transform: scale(0.98);
  border-color: rgba(59, 130, 246, 0.4);
}
.card--emergency {
  border-color: rgba(230, 57, 70, 0.5);
  background:
    radial-gradient(90% 100% at 0% 0%, rgba(230, 57, 70, 0.10) 0%, transparent 70%),
    var(--bg-elev);
  animation: card-alert 2s ease-in-out infinite alternate;
}
@keyframes card-alert {
  from { box-shadow: 0 0 0 0 rgba(230, 57, 70, 0.3); }
  to   { box-shadow: 0 0 20px 2px rgba(230, 57, 70, 0.4); }
}
@keyframes card-in {
  from { transform: translateY(6px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.card-type { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
.card-type-icon { font-size: 1.25rem; line-height: 1; flex-shrink: 0; margin-top: 2px; }
.card-type-text { min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.card-type-label { font-size: 1rem; font-weight: 700; }
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
.card-type-pred {
  display: block;
  font-size: 0.6875rem;
  color: #3b82f6;
  font-weight: 600;
}
.card-type-pred--match { color: var(--accent); }
.card-type-pred--mismatch { color: #f59e0b; }
.card-time { flex-shrink: 0; white-space: nowrap; }

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

.card-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
.card-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.card-actions-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  color: #3b82f6;
  font-weight: 600;
}
.card-arrow { transition: transform 0.15s ease; }
.card:active .card-arrow { transform: translateX(3px); }

.detail-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}
.detail-col { min-width: 0; display: flex; flex-direction: column; gap: 12px; }

.emergency-audio-card {
  background:
    radial-gradient(90% 100% at 0% 0%, rgba(230, 57, 70, 0.10) 0%, transparent 70%),
    var(--bg-elev);
  border: 1px solid rgba(230, 57, 70, 0.4);
  border-radius: var(--radius);
  padding: 14px 16px;
}
.emergency-audio-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.emergency-audio-icon { font-size: 1.5rem; }
.emergency-audio-label { font-size: 0.9375rem; font-weight: 700; }
.emergency-audio-meta { color: var(--text-muted); }
.emergency-audio-player { width: 100%; height: 44px; }

.no-media {
  background: var(--bg-elev);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  padding: 40px 24px;
  text-align: center;
  color: var(--text-muted);
}
.no-media-icon { font-size: 2rem; margin-bottom: 8px; opacity: 0.6; }

.detail-card {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
}

.detail-card--ml {
  border-color: rgba(59, 130, 246, 0.35);
  background:
    radial-gradient(80% 100% at 0% 0%, rgba(59, 130, 246, 0.08) 0%, transparent 70%),
    var(--bg-elev);
}

.ml-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}
.ml-badge {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.14);
  padding: 4px 10px;
  border-radius: 99px;
}
.ml-match { font-size: 0.6875rem; font-weight: 700; color: var(--accent); }
.ml-mismatch { font-size: 0.6875rem; font-weight: 700; color: #f59e0b; }

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
}
.detail-row + .detail-row { border-top: 1px solid var(--border); }
.detail-label { font-size: 0.8125rem; color: var(--text-muted); flex-shrink: 0; }
.detail-value {
  font-size: 0.9375rem;
  color: var(--text);
  text-align: right;
  word-break: break-word;
  min-width: 0;
}
.detail-value--multiline { text-align: left; line-height: 1.5; max-width: 70%; }

.severity-chip {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 10px;
  border-radius: 6px;
}
.severity-chip--low { color: #22c55e; background: rgba(34, 197, 94, 0.14); }
.severity-chip--medium { color: #f59e0b; background: rgba(245, 158, 11, 0.14); }
.severity-chip--high { color: #ef4444; background: rgba(239, 68, 68, 0.14); }
.severity-chip--critical { color: #fff; background: #dc2626; }

.detail-section-title {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.barangay-chip-row { margin-bottom: 16px; }
.barangay-chip-lg {
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
}
.barangay-edit {
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(59, 130, 246, 0.2);
  border: none;
  border-radius: 6px;
  color: #3b82f6;
  cursor: pointer;
}
.barangay-override-note { color: #f59e0b; margin-top: 6px; padding-left: 4px; }

.barangay-picker { position: relative; margin-bottom: 16px; }
.barangay-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  max-height: 220px;
  overflow-y: auto;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  z-index: 10;
  list-style: none;
  padding: 4px;
}
.barangay-item { padding: 10px 12px; border-radius: 8px; font-size: 0.9375rem; cursor: pointer; }
.barangay-item:hover, .barangay-item:active { background: var(--bg-input); }

.responder-preview { padding-top: 14px; border-top: 1px solid var(--border); }
.responder-loading { display: flex; align-items: center; gap: 8px; }
.responder-assigned, .responder-missing {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--radius);
}
.responder-assigned {
  background: var(--accent-soft);
  border: 1px solid rgba(47, 158, 115, 0.3);
}
.responder-missing {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
}
.responder-icon { font-size: 1.25rem; flex-shrink: 0; }
.responder-body { flex: 1; min-width: 0; }
.responder-name { font-size: 0.9375rem; font-weight: 700; margin-bottom: 2px; }
.responder-ok {
  color: var(--accent);
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
}

.error-banner {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius);
  padding: 10px 14px;
  font-size: 0.8125rem;
  color: var(--danger);
}

.detail-actions {
  display: flex;
  gap: 10px;
  padding-top: 8px;
}
.detail-actions .btn--ghost { flex: 0.6; }
.detail-dispatch { flex: 1; }
.detail-dispatch:disabled { opacity: 0.5; cursor: not-allowed; }

@media (min-width: 640px) {
  .head .h1 { font-size: 1.75rem; }
  .list { grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .count-number { font-size: 2.5rem; }
}

@media (min-width: 1024px) {
  .head .h1 { font-size: 2rem; }
  .head .muted { font-size: 1rem; }
  .head--detail { margin-bottom: 24px; }

  .list { grid-template-columns: repeat(3, 1fr); gap: 16px; }

  .detail-layout {
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }
  .detail-col--media { position: sticky; top: 24px; }

  .detail-actions {
    position: sticky;
    bottom: 0;
    background: var(--bg);
    padding: 14px 0 0;
    margin-top: 4px;
  }
}

@media (min-width: 1440px) {
  .list { grid-template-columns: repeat(4, 1fr); }
  .detail-layout { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 32px; }
}
</style>
