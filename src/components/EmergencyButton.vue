<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/firebase'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const RECORD_SECONDS = 10

const state = ref('idle')
const errorMsg = ref('')
const result = ref(null)
const secondsLeft = ref(RECORD_SECONDS)
const cooldown = ref(0)
const audioWarning = ref('')
const previewUrl = ref('')

let cooldownTimer = null
let countdownTimer = null
let mediaRecorder = null
let mediaStream = null
let audioChunks = []

const isBusy = computed(
  () => state.value === 'recording' ||
        state.value === 'uploading' ||
        state.value === 'sending'
)

const progressPct = computed(() => {
  const elapsed = RECORD_SECONDS - secondsLeft.value
  return Math.min(100, (elapsed / RECORD_SECONDS) * 100)
})

function getDeviceId() {
  let id = localStorage.getItem('rr:deviceId')
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
      `dev-${Math.random().toString(36).slice(2)}-${Date.now()}`
    localStorage.setItem('rr:deviceId', id)
  }
  return id
}

function startCooldown(seconds = 300) {
  cooldown.value = seconds
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0) {
      clearInterval(cooldownTimer)
      cooldownTimer = null
      cooldown.value = 0
    }
  }, 1000)
}

onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer)
  if (countdownTimer) clearInterval(countdownTimer)
  if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop())
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This device cannot get your location.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('Location permission denied. Enable it in your browser settings.'))
        } else if (err.code === err.TIMEOUT) {
          reject(new Error('Could not get your location in time.'))
        } else {
          reject(new Error('Could not get your location. Move to an open area and try again.'))
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    )
  })
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    audioWarning.value = 'Voice recording not supported on this browser.'
    return null
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
  } catch (e) {
    audioWarning.value = 'Voice recording skipped — microphone access was blocked.'
    return null
  }

  let mimeType = ''
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    mimeType = 'audio/webm;codecs=opus'
  } else if (MediaRecorder.isTypeSupported('audio/webm')) {
    mimeType = 'audio/webm'
  } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
    mimeType = 'audio/mp4'
  }

  return new Promise((resolve) => {
    audioChunks = []

    try {
      mediaRecorder = mimeType
        ? new MediaRecorder(mediaStream, { mimeType })
        : new MediaRecorder(mediaStream)
    } catch (e) {
      console.warn('[emergency] MediaRecorder init failed', e)
      mediaStream.getTracks().forEach((t) => t.stop())
      mediaStream = null
      audioWarning.value = 'Voice recording failed to start.'
      resolve(null)
      return
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data)
    }

    mediaRecorder.onstop = () => {
      const finalMime = mediaRecorder?.mimeType || 'audio/webm'
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop())
        mediaStream = null
      }
      if (!audioChunks.length) {
        resolve(null)
        return
      }
      const blob = new Blob(audioChunks, { type: finalMime })
      resolve({ blob, mimeType: finalMime })
    }

    mediaRecorder.start()

    setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop()
      }
    }, RECORD_SECONDS * 1000)
  })
}

function startCountdown() {
  secondsLeft.value = RECORD_SECONDS
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    secondsLeft.value -= 1
    if (secondsLeft.value <= 0) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

async function uploadAudio({ blob, mimeType }) {
  const uuid = (crypto.randomUUID && crypto.randomUUID()) ||
    `emg-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
  const path = `emergencies/${uuid}.${ext}`
  const ref = storageRef(storage, path)

  await uploadBytes(ref, blob, { contentType: mimeType })
  return await getDownloadURL(ref)
}

async function trigger() {
  if (isBusy.value || cooldown.value > 0) return

  state.value = 'recording'
  errorMsg.value = ''
  result.value = null
  audioWarning.value = ''
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }

  const locationPromise = getPosition().catch((e) => ({ __error: e }))
  startCountdown()
  const audioPromise = startRecording()

  const [locationResult, audioResult] = await Promise.all([
    locationPromise,
    audioPromise,
  ])

  if (locationResult.__error) {
    state.value = 'error'
    errorMsg.value = locationResult.__error.message
    return
  }

  let audioUrl = null
  let audioDurationSeconds = null

  if (audioResult?.blob) {
    state.value = 'uploading'
    try {
      audioUrl = await uploadAudio(audioResult)
      audioDurationSeconds = RECORD_SECONDS
      previewUrl.value = URL.createObjectURL(audioResult.blob)
    } catch (e) {
      console.warn('[emergency] audio upload failed', e)
      audioWarning.value = 'Voice message could not be uploaded — report sent without it.'
    }
  }

  state.value = 'sending'

  try {
    const resp = await fetch(`${API_URL}/emergency`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: locationResult.lat,
        lng: locationResult.lng,
        audio_url: audioUrl,
        audio_duration_seconds: audioDurationSeconds,
        device_id: getDeviceId(),
      }),
    })
    const data = await resp.json()

    if (!resp.ok || !data.ok) {
      throw new Error(data.message || 'Could not send the emergency report.')
    }

    result.value = data
    state.value = 'success'
    startCooldown(300)
  } catch (e) {
    state.value = 'error'
    errorMsg.value = e.message || 'Something went wrong.'
  }
}

function reset() {
  state.value = 'idle'
  errorMsg.value = ''
  result.value = null
  audioWarning.value = ''
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}
</script>

<template>
  <div class="sos-root">
    <button
      v-if="state === 'idle' || state === 'error'"
      type="button"
      class="sos-btn"
      :disabled="cooldown > 0"
      @click="trigger"
    >
      <span class="sos-pulse" aria-hidden="true" />
      <span class="sos-icon" aria-hidden="true">🚨</span>
      <span class="sos-label">
        <span class="sos-title">
          {{ cooldown > 0 ? `Wait ${cooldown}s` : 'Emergency' }}
        </span>
        <span class="sos-sub">
          {{
            cooldown > 0
              ? 'Already reported'
              : 'Tap once — records 10s and sends location'
          }}
        </span>
      </span>
    </button>

    <div v-if="state === 'recording'" class="rec-card">
      <div class="rec-top">
        <span class="rec-dot" aria-hidden="true" />
        <span class="rec-label">RECORDING</span>
      </div>

      <div class="rec-count">{{ secondsLeft }}</div>

      <p class="rec-hint">
        Say what happened and where you are.<br />
        Do not close this screen.
      </p>

      <div class="rec-progress" aria-hidden="true">
        <div class="rec-progress__fill" :style="{ width: `${progressPct}%` }" />
      </div>

      <div class="rec-badges">
        <span class="rec-badge">🎤 Listening…</span>
        <span class="rec-badge">📍 Getting location…</span>
      </div>
    </div>

    <div v-if="state === 'uploading' || state === 'sending'" class="sos-progress">
      <div class="progress-spinner" aria-hidden="true" />
      <p class="progress-title">
        {{ state === 'uploading' ? 'Uploading voice message…' : 'Notifying admin…' }}
      </p>
      <p class="tiny">Almost there.</p>
    </div>

    <div v-if="state === 'success' && result" class="sos-success">
      <div class="success-icon" aria-hidden="true">✓</div>
      <h3 class="success-title">Emergency received</h3>
      <p class="success-ref">
        Ref <strong>{{ result.short_id }}</strong>
      </p>
      <p class="tiny success-detail">
        {{ result.message }}<br />
        Location: <strong>{{ result.barangay }}</strong>
      </p>

      <div v-if="result.has_audio && previewUrl" class="audio-preview">
        <p class="audio-preview-label">Your voice message</p>
        <audio :src="previewUrl" controls class="audio-player" />
      </div>
      <p v-else-if="audioWarning" class="audio-warning tiny">
        ⚠️ {{ audioWarning }}
      </p>

      <button class="btn btn--ghost success-close" @click="reset">Close</button>
    </div>

    <div v-if="state === 'error'" class="sos-error">
      <p class="error-title">Could not send</p>
      <p class="tiny">{{ errorMsg }}</p>
      <p class="tiny error-hint">
        If this is life-threatening, call <strong>911</strong> directly.
      </p>
      <button class="btn btn--primary" @click="reset">Try again</button>
    </div>
  </div>
</template>

<style scoped>
.sos-root { width: 100%; display: flex; flex-direction: column; gap: 10px; }

.sos-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 88px;
  padding: 16px 20px;
  border: none;
  border-radius: 20px;
  background: linear-gradient(160deg, #ff4d5e 0%, #e63946 55%, #b81f2b 100%);
  color: #fff;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  box-shadow:
    0 10px 30px rgba(230, 57, 70, 0.45),
    0 2px 6px rgba(230, 57, 70, 0.6);
  transition: transform 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}
.sos-btn:active:not(:disabled) { transform: scale(0.97); }
.sos-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.sos-pulse {
  position: absolute;
  inset: 0;
  border-radius: 20px;
  background: #e63946;
  opacity: 0.4;
  animation: sos-pulse 2.2s ease-out infinite;
  pointer-events: none;
}
@keyframes sos-pulse {
  0%   { transform: scale(1);    opacity: 0.4; }
  70%  { transform: scale(1.06); opacity: 0; }
  100% { transform: scale(1.06); opacity: 0; }
}

.sos-icon { font-size: 2rem; line-height: 1; flex-shrink: 0; }
.sos-label { display: flex; flex-direction: column; gap: 2px; }
.sos-title { font-size: 1.25rem; font-weight: 800; letter-spacing: -0.01em; }
.sos-sub { font-size: 0.75rem; font-weight: 600; opacity: 0.9; }

.rec-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 22px 20px 20px;
  background:
    radial-gradient(90% 100% at 50% 0%, rgba(230, 57, 70, 0.18) 0%, transparent 70%),
    var(--bg-elev, #121c2e);
  border: 1.5px solid rgba(230, 57, 70, 0.5);
  border-radius: 20px;
  text-align: center;
  animation: rec-glow 1.4s ease-in-out infinite alternate;
}
@keyframes rec-glow {
  from { box-shadow: 0 0 0 0 rgba(230, 57, 70, 0.35); }
  to   { box-shadow: 0 0 24px 4px rgba(230, 57, 70, 0.5); }
}
.rec-top { display: flex; align-items: center; gap: 8px; }
.rec-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #e63946;
  animation: rec-dot 1s ease-in-out infinite alternate;
}
@keyframes rec-dot {
  from { opacity: 1;   transform: scale(1); }
  to   { opacity: 0.4; transform: scale(0.75); }
}
.rec-label {
  font-size: 0.6875rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #e63946;
}
.rec-count {
  font-size: 4rem;
  font-weight: 900;
  line-height: 1;
  color: var(--text, #eaf0fa);
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}
.rec-hint {
  font-size: 0.8125rem;
  color: var(--text-muted, #93a3bd);
  line-height: 1.5;
  max-width: 30ch;
}
.rec-progress {
  width: 100%;
  height: 6px;
  border-radius: 99px;
  background: rgba(230, 57, 70, 0.18);
  overflow: hidden;
}
.rec-progress__fill {
  height: 100%;
  background: linear-gradient(90deg, #ff4d5e, #e63946);
  border-radius: 99px;
  transition: width 0.9s linear;
}
.rec-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 4px;
}
.rec-badge {
  font-size: 0.6875rem;
  font-weight: 650;
  padding: 4px 10px;
  border-radius: 99px;
  background: var(--bg-input, #0f1729);
  border: 1px solid var(--border, #22304a);
  color: var(--text-muted, #93a3bd);
  white-space: nowrap;
}

.sos-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 16px;
  background: var(--bg-elev, #121c2e);
  border: 1px solid var(--border, #22304a);
  border-radius: 20px;
  text-align: center;
}
.progress-spinner {
  width: 32px; height: 32px;
  border-radius: 50%;
  border: 3px solid var(--border, #22304a);
  border-top-color: #e63946;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.progress-title { font-size: 0.9375rem; font-weight: 700; }

.sos-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 24px 20px;
  background:
    radial-gradient(90% 100% at 50% 0%, rgba(47, 158, 115, 0.15) 0%, transparent 70%),
    var(--bg-elev, #121c2e);
  border: 1px solid rgba(47, 158, 115, 0.35);
  border-radius: 20px;
  text-align: center;
}
.success-icon {
  width: 52px; height: 52px;
  border-radius: 50%;
  background: linear-gradient(160deg, #3cb886, #2f9e73 55%, #267a58);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 28px;
  font-weight: 800;
  margin-bottom: 6px;
  box-shadow: 0 8px 24px rgba(47, 158, 115, 0.4);
}
.success-title { font-size: 1.125rem; font-weight: 750; }
.success-ref { font-size: 0.8125rem; color: var(--text-muted, #93a3bd); }
.success-ref strong {
  color: var(--text, #eaf0fa);
  font-family: ui-monospace, monospace;
  letter-spacing: 0.05em;
}
.success-detail { line-height: 1.5; max-width: 32ch; }

.audio-preview {
  width: 100%;
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-input, #0f1729);
  border: 1px solid var(--border, #22304a);
  border-radius: 12px;
}
.audio-preview-label {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted, #93a3bd);
  margin-bottom: 8px;
  text-align: left;
}
.audio-player { width: 100%; height: 40px; }
.audio-warning { margin-top: 10px; color: #f59e0b; line-height: 1.4; }
.success-close { margin-top: 14px; max-width: 180px; }

.sos-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 20px;
  text-align: center;
}
.error-title { font-size: 0.9375rem; font-weight: 700; color: #ef4444; }
.error-hint { color: var(--text-muted, #93a3bd); margin-bottom: 4px; }
.error-hint strong { color: #ef4444; }
</style>
