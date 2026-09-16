<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
  GeoPoint,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { useMediaUpload } from '@/composables/useMediaUpload'
import {
  BARANGAY_NAMES,
  searchBarangays,
  findNearestBarangay,
} from '@/data/barangays'

const emit = defineEmits(['submitted', 'go-to-map'])

const auth = useAuthStore()
const media = useMediaUpload()

// ---------- Media limits ----------
const MAX_PHOTOS = 3
const MAX_PHOTO_MB = 5
const MAX_VIDEO_MB = 50

// ---------- Emergency types ----------
const TYPES = [
  { key: 'flat_tire',       label: 'Flat Tire',      icon: '🛞' },
  { key: 'battery',         label: 'Dead Battery',   icon: '🔋' },
  { key: 'fuel',            label: 'Out of Fuel',    icon: '⛽' },
  { key: 'stalled_vehicle', label: 'Stalled',        icon: '🛑' },
  { key: 'minor_collision', label: 'Minor Crash',    icon: '🚗' },
  { key: 'major_collision', label: 'Major Crash',    icon: '💥' },
  { key: 'vehicle_fire',    label: 'Vehicle Fire',   icon: '🔥' },
  { key: 'road_hazard',     label: 'Road Hazard',    icon: '⚠️' },
]

// ---------- State ----------
const selectedType = ref(null)
const description = ref('')

const selectedBarangay = ref('')
const barangayQuery = ref('')
const barangayOpen = ref(false)
const autoDetected = ref(null)
const userOverrode = ref(false)

const filteredBarangays = computed(() => searchBarangays(barangayQuery.value))

// Photos
const photoFiles = ref([])
const photoPreviews = ref([])

// Video
const videoFile = ref(null)
const videoPreview = ref('')
const videoSizeLabel = ref('')

// Location
const location = ref(null)
const locating = ref(false)
const locationError = ref('')

// Submission
const submitting = ref(false)
const error = ref('')
const submitted = ref(false)
const submittedId = ref(null)

// ---------- Computed ----------
const canSubmit = computed(
  () =>
    !!selectedType.value &&
    !!location.value &&
    !!selectedBarangay.value &&
    !submitting.value
)

// ---------- Lifecycle ----------
onMounted(() => {
  requestLocation()
})

// ---------- Geolocation ----------
function requestLocation() {
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
      location.value = { lng: longitude, lat: latitude, accuracy }

      // Auto-detect nearest barangay unless user manually picked
      if (!userOverrode.value) {
        const nearest = findNearestBarangay(latitude, longitude)
        if (nearest) {
          autoDetected.value = {
            name: nearest.name,
            distance: nearest.distance,
          }
          selectedBarangay.value = nearest.name
        }
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
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  )
}

// ---------- Photo handling ----------
function onPhotoSelected(e) {
  const files = Array.from(e.target.files || [])
  for (const file of files) {
    if (photoFiles.value.length >= MAX_PHOTOS) break
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      error.value = `Photo must be under ${MAX_PHOTO_MB} MB.`
      continue
    }
    photoFiles.value.push(file)
    photoPreviews.value.push(URL.createObjectURL(file))
  }
  e.target.value = ''
}

function removePhoto(index) {
  URL.revokeObjectURL(photoPreviews.value[index])
  photoFiles.value.splice(index, 1)
  photoPreviews.value.splice(index, 1)
}

// ---------- Video handling ----------
function onVideoSelected(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return

  if (videoFile.value) {
    URL.revokeObjectURL(videoPreview.value)
  }

  if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
    error.value = `Video must be under ${MAX_VIDEO_MB} MB.`
    return
  }

  videoFile.value = file
  videoPreview.value = URL.createObjectURL(file)

  const mb = file.size / (1024 * 1024)
  videoSizeLabel.value = `${mb.toFixed(1)} MB`
}

function removeVideo() {
  if (videoPreview.value) URL.revokeObjectURL(videoPreview.value)
  videoFile.value = null
  videoPreview.value = ''
  videoSizeLabel.value = ''
}

// ---------- Submit ----------
async function submit() {
  if (!canSubmit.value) return

  error.value = ''
  submitting.value = true

  try {
    const { lng, lat, accuracy } = location.value
    const profile = auth.profile || {}

    // 1) Pre-generate incident ID so we know the Storage folder
    const incidentsCol = collection(db, 'incidents')
    const docRef = doc(incidentsCol)
    const incidentId = docRef.id

    // 2) Upload media first — if it fails, nothing is written
    let photoUrls = []
    let videoUrl = null

    const hasMedia = photoFiles.value.length > 0 || videoFile.value
    if (hasMedia) {
      const uploaded = await media.uploadAll(
        incidentId,
        photoFiles.value,
        videoFile.value
      )
      photoUrls = uploaded.photoUrls
      videoUrl = uploaded.videoUrl
    }

    // 3) Write the incident document
    await setDoc(docRef, {
      citizenUid: auth.user?.uid,
      citizenName: profile.fullName || '',
      citizenPhone: profile.phone || '',

      type: selectedType.value,
      description: description.value.trim(),

      barangay: selectedBarangay.value,

      location: new GeoPoint(lat, lng),
      accuracy: accuracy || null,

      status: 'unverified',
      responderUid: null,
      responderName: null,

      photoUrls,
      videoUrl,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    submittedId.value = incidentId
    submitted.value = true
    emit('submitted', { id: incidentId, type: selectedType.value })

    // Cleanup blob URLs
    photoPreviews.value.forEach((url) => URL.revokeObjectURL(url))
    if (videoPreview.value) URL.revokeObjectURL(videoPreview.value)
  } catch (e) {
    console.error('[ReportTab] submit failed', e)
    error.value =
      e?.message || 'Could not submit your request. Please try again.'
    submitting.value = false
  }
}

// ---------- Reset ----------
function resetForm() {
  selectedType.value = null
  description.value = ''
  photoFiles.value = []
  photoPreviews.value.forEach((url) => URL.revokeObjectURL(url))
  photoPreviews.value = []
  removeVideo()
  submitting.value = false
  error.value = ''
  submitted.value = false
  submittedId.value = null
  media.reset()
  requestLocation()
}

function goToMap() {
  emit('go-to-map')
}
</script>

<template>
  <section class="report-tab">
    <!-- ==================== SUCCESS ==================== -->
    <div v-if="submitted" class="success-wrap">
      <div class="success-icon" aria-hidden="true">✅</div>
      <h1 class="h1 success-title">Request sent</h1>
      <p class="muted success-text">
        Nearby responders have been notified. You'll get live updates as
        they respond.
      </p>

      <div class="success-actions">
        <button class="btn btn--primary" @click="goToMap">
          Track on map
        </button>
        <button class="btn btn--ghost" @click="resetForm">
          File another report
        </button>
      </div>
    </div>

    <!-- ==================== FORM ==================== -->
    <template v-else>
      <header class="head">
        <h1 class="h1">Report an incident</h1>
        <p class="muted">
          Tell us what's happening — a nearby responder will be notified.
        </p>
      </header>

      <!-- ---------- Emergency type ---------- -->
      <div class="section">
        <p class="section-label">What's the emergency?</p>
        <div class="type-grid">
          <button
            v-for="t in TYPES"
            :key="t.key"
            type="button"
            class="type-btn"
            :class="{ 'type-btn--on': selectedType === t.key }"
            @click="selectedType = t.key"
          >
            <span class="type-icon" aria-hidden="true">{{ t.icon }}</span>
            <span class="type-label">{{ t.label }}</span>
          </button>
        </div>
      </div>

      <!-- ---------- Description ---------- -->
      <div class="section">
        <p class="section-label">Description (optional)</p>
        <textarea
          v-model="description"
          class="input textarea"
          rows="4"
          maxlength="300"
          placeholder="Any details that will help the responder — landmarks, vehicle color, number of people, etc."
        />
        <p class="tiny char-count">{{ description.length }}/300</p>
      </div>

      <!-- ---------- Barangay ---------- -->
      <div class="section">
        <p class="section-label">Barangay</p>

        <div v-if="selectedBarangay" class="barangay-selected">
          <span class="barangay-chip">
            <span class="barangay-pin" aria-hidden="true">📍</span>
            {{ selectedBarangay }}
            <button
              type="button"
              class="barangay-clear"
              aria-label="Change barangay"
              @click="
                selectedBarangay = '';
                barangayQuery = '';
              "
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </span>
          <p
            v-if="autoDetected && !userOverrode"
            class="barangay-auto-hint"
          >
            ✨ Auto-detected from your location
            <template v-if="autoDetected.distance">
              ({{ Math.round(autoDetected.distance) }} m from barangay center)
            </template>
          </p>
        </div>

        <div v-else class="barangay-picker">
          <input
            v-model="barangayQuery"
            type="text"
            class="input"
            placeholder="Search barangay…"
            @focus="barangayOpen = true"
            @input="barangayOpen = true"
          />
          <ul
            v-if="barangayOpen && filteredBarangays.length"
            class="barangay-list"
          >
            <li
              v-for="b in filteredBarangays.slice(0, 8)"
              :key="b"
              class="barangay-item"
              @click="
                selectedBarangay = b;
                userOverrode = true;
                barangayOpen = false;
                barangayQuery = '';
              "
            >
              {{ b }}
            </li>
            <li
              v-if="filteredBarangays.length > 8"
              class="barangay-more"
            >
              +{{ filteredBarangays.length - 8 }} more — keep typing to narrow
            </li>
          </ul>
          <p
            v-else-if="
              barangayOpen && barangayQuery && !filteredBarangays.length
            "
            class="barangay-empty"
          >
            No barangay matches "{{ barangayQuery }}"
          </p>
        </div>

        <p class="tiny barangay-hint">
          Used to alert the assigned barangay official for faster response.
        </p>
      </div>

      <!-- ---------- Photos ---------- -->
      <div class="section">
        <p class="section-label">
          Photos (optional, {{ MAX_PHOTOS }} max)
        </p>
        <div class="photo-grid">
          <div
            v-for="(url, i) in photoPreviews"
            :key="i"
            class="photo-preview"
          >
            <img :src="url" alt="" />
            <button
              type="button"
              class="photo-remove"
              aria-label="Remove photo"
              @click="removePhoto(i)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>

          <label
            v-if="photoPreviews.length < MAX_PHOTOS"
            class="photo-add"
            for="photo-input"
          >
            <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
            <span class="photo-add-text">Add</span>
          </label>
        </div>
        <input
          id="photo-input"
          type="file"
          accept="image/*"
          multiple
          class="photo-input"
          @change="onPhotoSelected"
        />
      </div>

      <!-- ---------- Video ---------- -->
      <div class="section">
        <p class="section-label">Video (optional, 1 max)</p>

        <div v-if="videoFile" class="video-preview">
          <video :src="videoPreview" controls preload="metadata" />
          <div class="video-meta">
            <span class="video-size tiny">{{ videoSizeLabel }}</span>
            <button
              type="button"
              class="video-remove"
              aria-label="Remove video"
              @click="removeVideo"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <label v-else class="video-add" for="video-input">
          <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
            <rect
              x="2"
              y="6"
              width="14"
              height="12"
              rx="2"
              stroke="currentColor"
              stroke-width="2"
            />
            <path
              d="m22 8-6 4 6 4V8Z"
              stroke="currentColor"
              stroke-width="2"
              stroke-linejoin="round"
            />
          </svg>
          <span class="video-add-text">
            Add video (max {{ MAX_VIDEO_MB }} MB)
          </span>
        </label>
        <input
          id="video-input"
          type="file"
          accept="video/*"
          class="photo-input"
          @change="onVideoSelected"
        />
      </div>

      <!-- ---------- Location ---------- -->
      <div class="section">
        <p class="section-label">Your location</p>

        <div class="location-card">
          <div class="location-icon" aria-hidden="true">📍</div>
          <div class="location-body">
            <template v-if="locating">
              <p class="location-title">Getting your location…</p>
              <p class="tiny">Make sure location access is allowed.</p>
            </template>
            <template v-else-if="location">
              <p class="location-title">Location captured</p>
              <p class="tiny">
                {{ location.lat.toFixed(5) }}, {{ location.lng.toFixed(5) }}
                <template v-if="location.accuracy">
                  · ±{{ Math.round(location.accuracy) }}m
                </template>
              </p>
            </template>
            <template v-else>
              <p class="location-title location-title--error">
                {{ locationError || 'No location yet' }}
              </p>
              <button
                type="button"
                class="btn btn--link location-retry"
                @click="requestLocation"
              >
                Try again
              </button>
            </template>
          </div>
        </div>
      </div>

      <!-- ---------- Upload progress ---------- -->
      <div v-if="media.uploading.value" class="upload-bar">
        <div class="upload-bar__track">
          <div
            class="upload-bar__fill"
            :style="{ width: `${media.progress.value}%` }"
          />
        </div>
        <p class="upload-bar__text tiny">
          Uploading media… {{ media.progress.value }}%
        </p>
      </div>

      <!-- ---------- Errors ---------- -->
      <p v-if="error" class="error-text error-block">{{ error }}</p>

      <div class="spacer" />

      <!-- ---------- Submit ---------- -->
      <button
        class="btn btn--primary submit-btn"
        :disabled="!canSubmit"
        @click="submit"
      >
        {{
          submitting
            ? media.uploading.value
              ? `Uploading… ${media.progress.value}%`
              : 'Sending request…'
            : 'Send Request'
        }}
      </button>

      <p class="tiny submit-note">
        For life-threatening emergencies, call your local emergency number
        first.
      </p>
    </template>
  </section>
</template>

<style scoped>
.report-tab {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* ---------- Header ---------- */
.head {
  margin-bottom: 24px;
}

.head .h1 {
  font-size: 1.5rem;
}

.head .muted {
  margin-top: 6px;
  line-height: 1.5;
}

/* ---------- Section ---------- */
.section {
  margin-bottom: 22px;
}

.section-label {
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 10px;
}

/* ---------- Type grid ---------- */
.type-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

@media (max-width: 360px) {
  .type-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.type-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 8px;
  background: var(--bg-input);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease;
  min-height: 84px;
}

.type-btn:active {
  transform: scale(0.96);
}

.type-btn--on {
  background: var(--primary-soft);
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary) inset;
}

.type-icon {
  font-size: 1.5rem;
  line-height: 1;
}

.type-label {
  font-size: 0.6875rem;
  font-weight: 650;
  text-align: center;
  line-height: 1.2;
}

/* ---------- Description ---------- */
.textarea {
  resize: none;
  min-height: 100px;
  padding: 12px 14px;
  font-family: inherit;
  line-height: 1.5;
}

.char-count {
  text-align: right;
  margin-top: 4px;
}

/* ---------- Barangay ---------- */
.barangay-picker {
  position: relative;
}

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

.barangay-item {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.9375rem;
  cursor: pointer;
  transition: background 0.12s ease;
  -webkit-tap-highlight-color: transparent;
}

.barangay-item:active,
.barangay-item:hover {
  background: var(--bg-input);
}

.barangay-more {
  padding: 8px 12px;
  font-size: 0.75rem;
  color: var(--text-dim);
  text-align: center;
  border-top: 1px solid var(--border);
  margin-top: 4px;
}

.barangay-empty {
  padding: 10px 12px;
  font-size: 0.8125rem;
  color: var(--text-muted);
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-top: 4px;
}

.barangay-selected {
  margin-bottom: 0;
}

.barangay-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--primary-soft);
  border: 1px solid var(--primary);
  border-radius: 99px;
  color: var(--primary);
  font-size: 0.875rem;
  font-weight: 600;
  max-width: 100%;
}

.barangay-pin {
  font-size: 0.875rem;
}

.barangay-clear {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  margin-left: 2px;
  flex-shrink: 0;
}

.barangay-clear:active {
  transform: scale(0.9);
}

.barangay-hint {
  margin-top: 6px;
  line-height: 1.4;
}

.barangay-auto-hint {
  margin-top: 8px;
  font-size: 0.75rem;
  color: var(--accent);
  line-height: 1.4;
  padding: 6px 10px;
  background: var(--accent-soft);
  border: 1px solid rgba(47, 158, 115, 0.25);
  border-radius: 10px;
}

/* ---------- Photos ---------- */
.photo-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.photo-preview,
.photo-add {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-input);
  border: 1.5px solid var(--border);
}

.photo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  border: none;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.photo-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  color: var(--text-muted);
  border-style: dashed;
  transition: all 0.15s ease;
}

.photo-add:active {
  transform: scale(0.96);
  background: var(--bg-elev);
}

.photo-add-text {
  font-size: 0.6875rem;
  font-weight: 600;
}

.photo-input {
  display: none;
}

/* ---------- Video ---------- */
.video-preview {
  position: relative;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-input);
  border: 1.5px solid var(--border);
}

.video-preview video {
  width: 100%;
  display: block;
  max-height: 240px;
  background: #000;
}

.video-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-elev);
}

.video-size {
  color: var(--text-muted);
}

.video-remove {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.15);
  border: none;
  color: var(--danger);
  cursor: pointer;
}

.video-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 22px 16px;
  min-height: 96px;
  background: var(--bg-input);
  border: 1.5px dashed var(--border);
  border-radius: var(--radius);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.video-add:active {
  transform: scale(0.98);
  background: var(--bg-elev);
}

.video-add-text {
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
}

/* ---------- Location card ---------- */
.location-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.location-icon {
  font-size: 1.25rem;
  line-height: 1;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  background: var(--bg-input);
  border-radius: 10px;
  flex-shrink: 0;
}

.location-body {
  min-width: 0;
  flex: 1;
}

.location-title {
  font-size: 0.9375rem;
  font-weight: 650;
  margin-bottom: 2px;
}

.location-title--error {
  color: var(--danger);
}

.location-retry {
  padding: 0;
  margin-top: 4px;
  color: var(--primary);
  text-decoration: underline;
  font-size: 0.8125rem;
}

/* ---------- Upload progress ---------- */
.upload-bar {
  margin-bottom: 14px;
}

.upload-bar__track {
  width: 100%;
  height: 6px;
  background: var(--bg-input);
  border-radius: 99px;
  overflow: hidden;
  margin-bottom: 6px;
}

.upload-bar__fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), #3cb886);
  transition: width 0.25s ease;
}

.upload-bar__text {
  text-align: center;
  color: var(--accent);
}

/* ---------- Errors + submit ---------- */
.error-block {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius);
  padding: 10px 14px;
  font-size: 0.8125rem;
  margin-bottom: 16px;
}

.spacer {
  flex: 1;
  min-height: 8px;
}

.submit-btn {
  font-size: 1.0625rem;
  min-height: 54px;
}

.submit-note {
  text-align: center;
  margin-top: 10px;
  line-height: 1.5;
}

/* ---------- Success ---------- */
.success-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 8vh 8px 0;
  flex: 1;
}

.success-icon {
  font-size: 4rem;
  line-height: 1;
  margin-bottom: 20px;
  animation: pop 0.5s cubic-bezier(0.3, 1.5, 0.6, 1);
}

@keyframes pop {
  0%   { transform: scale(0.4); opacity: 0; }
  100% { transform: scale(1);   opacity: 1; }
}

.success-title {
  margin-bottom: 10px;
}

.success-text {
  max-width: 32ch;
  line-height: 1.55;
  margin-bottom: 32px;
}

.success-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 320px;
}
</style>