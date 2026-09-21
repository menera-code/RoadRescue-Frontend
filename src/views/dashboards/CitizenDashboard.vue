<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BottomNav from '@/components/BottomNav.vue'

import HomeTab from './citizen/HomeTab.vue'
import HistoryTab from './citizen/HistoryTab.vue'
import MapTab from './citizen/MapTab.vue'
import ReportTab from './citizen/ReportTab.vue'
import LegalTab from './citizen/LegalTab.vue'
import ProfileTab from './citizen/ProfileTab.vue'

// Which tab is currently visible — map is the default
const activeTab = ref('map')

// Profile opens as a full-screen sheet (triggered from HomeTab avatar)
const showProfile = ref(false)

/* ==================================================================
 * Location permission gate
 * Shows a modal when location is off/denied/blocked. On Android the
 * native dialog only fires when we actually call getCurrentPosition(),
 * so we probe first and classify the failure afterwards.
 * ================================================================== */
const DISMISS_KEY = 'citizen:location-prompt-dismissed'

const showLocationModal = ref(false)
// 'prompt' | 'granted' | 'denied' | 'insecure' | 'unsupported' | 'stuck'
const locationState = ref('prompt')
const isRequesting = ref(false)
const isEmbedded = ref(false)
const isAndroid = ref(false)

let permissionStatus = null

const canUseGeolocation = () =>
  typeof navigator !== 'undefined' && 'geolocation' in navigator

/**
 * Detect in-app / WebView browsers that frequently have a broken
 * geolocation bridge on Android (Facebook, Instagram, LINE, generic wv).
 */
function detectEmbeddedBrowser() {
  const ua = navigator.userAgent || ''
  const android = /Android/i.test(ua)
  const webview =
    /;\s*wv\)/i.test(ua) ||
    /FBAN|FBAV|FB_IAB|Instagram|Line\//i.test(ua) ||
    /Twitter|MicroMessenger|KAKAOTALK/i.test(ua)
  return { android, webview }
}

/**
 * The only reliable way to (re)trigger the native permission dialog on
 * Android is to actually call getCurrentPosition(). We wrap it in a
 * Promise so we can reason about the outcome deterministically.
 */
function probeLocation(timeout = 15000) {
  return new Promise((resolve) => {
    if (!canUseGeolocation()) {
      resolve({ ok: false, reason: 'unsupported' })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, pos }),
      (err) => {
        if (err.code === 1 /* PERMISSION_DENIED */) {
          resolve({ ok: false, reason: 'denied' })
        } else if (err.code === 2 /* POSITION_UNAVAILABLE */) {
          // OS-level GPS / location services is off
          resolve({ ok: false, reason: 'unavailable' })
        } else {
          resolve({ ok: false, reason: 'timeout' })
        }
      },
      {
        enableHighAccuracy: true,
        timeout,
        maximumAge: 0,
      }
    )
  })
}

/**
 * Try the real thing first, then classify the failure so we can show
 * the right guidance to the user.
 */
async function requestLocation() {
  if (isRequesting.value) return
  isRequesting.value = true

  // 1) Real attempt — this is what pops the native dialog
  const result = await probeLocation()

  if (result.ok) {
    isRequesting.value = false
    locationState.value = 'granted'
    showLocationModal.value = false
    sessionStorage.removeItem(DISMISS_KEY)
    return
  }

  // 2) Failed → figure out WHY so we can show the right message
  if (!window.isSecureContext) {
    locationState.value = 'insecure'
    isRequesting.value = false
    showLocationModal.value = true
    return
  }

  if (result.reason === 'unsupported') {
    locationState.value = 'unsupported'
  } else if (result.reason === 'unavailable') {
    // OS-level Location toggle is off
    locationState.value = 'denied'
  } else if (result.reason === 'denied') {
    // Cross-check Permissions API — if it says granted but read failed,
    // we're in the classic Android WebView "stuck" state.
    let apiState = null
    try {
      const status = await navigator.permissions?.query?.({ name: 'geolocation' })
      apiState = status?.state ?? null
    } catch {}

    if (apiState === 'granted' || (apiState === 'prompt' && isEmbedded.value)) {
      locationState.value = 'stuck'
    } else {
      locationState.value = 'denied'
    }
  } else {
    // timeout
    locationState.value = isEmbedded.value ? 'stuck' : 'denied'
  }

  isRequesting.value = false
  showLocationModal.value = true
}

function dismissLocationModal() {
  showLocationModal.value = false
  sessionStorage.setItem(DISMISS_KEY, '1')
}

/** Android: force-open the current URL in Chrome via an intent:// URL. */
function openInChrome() {
  const url = window.location.href
  const bare = url.replace(/^https?:\/\//, '')
  const scheme = url.startsWith('https://') ? 'https' : 'http'
  const intentUrl =
    `intent://${bare}#Intent;scheme=${scheme};` +
    `package=com.android.chrome;end`

  // Fallback if Chrome isn't installed
  const fallback = setTimeout(() => {
    window.location.href = url
  }, 800)

  window.addEventListener(
    'pagehide',
    () => clearTimeout(fallback),
    { once: true }
  )
  window.location.href = intentUrl
}

/** Re-check when the user returns from Android Settings. */
async function handleVisibility() {
  if (document.visibilityState !== 'visible') return
  if (locationState.value === 'granted') return

  const result = await probeLocation(6000)
  if (result.ok) {
    locationState.value = 'granted'
    showLocationModal.value = false
    sessionStorage.removeItem(DISMISS_KEY)
  }
}

onMounted(async () => {
  const env = detectEmbeddedBrowser()
  isEmbedded.value = env.webview
  isAndroid.value = env.android
  document.addEventListener('visibilitychange', handleVisibility)

  if (!window.isSecureContext) {
    locationState.value = 'insecure'
    showLocationModal.value = true
    return
  }

  if (!canUseGeolocation()) {
    locationState.value = 'unsupported'
    showLocationModal.value = true
    return
  }

  // Silent probe — if we already have access, no modal at all
  const result = await probeLocation(5000)
  if (result.ok) {
    locationState.value = 'granted'
    return
  }

  if (sessionStorage.getItem(DISMISS_KEY) === '1') return

  locationState.value = 'prompt'
  showLocationModal.value = true

  // Best-effort watcher so we auto-close if the user grants elsewhere
  try {
    permissionStatus = await navigator.permissions?.query?.({ name: 'geolocation' })
    if (permissionStatus) {
      permissionStatus.onchange = () => {
        if (permissionStatus.state === 'granted') {
          locationState.value = 'granted'
          showLocationModal.value = false
        }
      }
    }
  } catch {}
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibility)
  if (permissionStatus) permissionStatus.onchange = null
})

/* ---------- Modal copy ---------- */
const modalTitle = computed(() => {
  switch (locationState.value) {
    case 'denied':      return 'Location access is blocked'
    case 'insecure':    return 'Location needs a secure connection'
    case 'unsupported': return 'Location isn’t available'
    case 'stuck':       return 'Location is enabled but not responding'
    default:            return 'Allow location access'
  }
})

const modalMessage = computed(() => {
  switch (locationState.value) {
    case 'denied':
      return 'Your phone is blocking location for this page. Turn it on for this browser in your device settings, then come back.'
    case 'insecure':
      return 'Browsers only share location over HTTPS. Please reopen this page using https://.'
    case 'unsupported':
      return 'This device or browser doesn’t support location services.'
    case 'stuck':
      return 'Your device says location is allowed, but the browser still can’t read it. This usually happens inside an in-app browser. Open this page in Chrome to fix it.'
    default:
      return 'We use your location to show nearby reports on the map and to tag the exact spot on reports you send. It’s only used while you’re using the app.'
  }
})

const canRetry = computed(() =>
  ['prompt', 'denied', 'stuck'].includes(locationState.value)
)

const actionLabel = computed(() => {
  if (isRequesting.value) return 'Checking…'
  if (locationState.value === 'stuck') return 'Try again'
  return locationState.value === 'denied' ? 'Try again' : 'Allow location'
})
</script>

<template>
  <div class="citizen-shell">
    <!-- Main scrollable tab area -->
    <main class="tab-stage" :class="`tab-stage--${activeTab}`">
      <KeepAlive>
        <HomeTab
          v-if="activeTab === 'home'"
          @open-profile="showProfile = true"
        />
        <HistoryTab v-else-if="activeTab === 'history'" />
        <MapTab v-else-if="activeTab === 'map'" />
        <ReportTab
          v-else-if="activeTab === 'report'"
          @go-to-map="activeTab = 'map'"
        />
        <LegalTab v-else-if="activeTab === 'legal'" />
      </KeepAlive>
    </main>

    <!-- Bottom navigation -->
    <BottomNav v-model="activeTab" />

    <!-- Profile sheet — full-screen overlay -->
    <Transition name="sheet">
      <div v-if="showProfile" class="profile-sheet">
        <header class="profile-sheet__head">
          <h2 class="profile-sheet__title">Profile</h2>
          <button
            class="profile-sheet__close"
            aria-label="Close profile"
            @click="showProfile = false"
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
        <div class="profile-sheet__body">
          <ProfileTab />
        </div>
      </div>
    </Transition>

    <!-- Location permission modal -->
    <Transition name="modal">
      <div
        v-if="showLocationModal"
        class="loc-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="loc-title"
        aria-describedby="loc-desc"
      >
        <div class="loc-card">
          <div
            class="loc-icon"
            :class="{
              'loc-icon--warn':
                locationState === 'denied' || locationState === 'stuck',
            }"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linejoin="round"
              />
              <circle
                cx="12"
                cy="10"
                r="2.6"
                stroke="currentColor"
                stroke-width="1.8"
              />
            </svg>
          </div>

          <h2 id="loc-title" class="loc-title">{{ modalTitle }}</h2>
          <p id="loc-desc" class="loc-text">{{ modalMessage }}</p>

          <!-- Denied: device Settings path -->
          <ol v-if="locationState === 'denied'" class="loc-steps">
            <li>Open your phone’s <strong>Settings</strong></li>
            <li>
              Tap <strong>Apps</strong> →
              <strong>{{ isEmbedded ? 'this app' : 'your browser' }}</strong>
            </li>
            <li>
              Tap <strong>Permissions</strong> → <strong>Location</strong> →
              <strong>Allow</strong>
            </li>
            <li>Come back here and tap <strong>Try again</strong></li>
          </ol>

          <!-- Stuck: in-app browser escape hatch -->
          <template v-if="locationState === 'stuck'">
            <ol class="loc-steps">
              <li>Tap the <strong>⋮</strong> menu in the top-right</li>
              <li>
                Choose <strong>Open in browser</strong> /
                <strong>Open in Chrome</strong>
              </li>
              <li>Allow location when Chrome asks</li>
            </ol>
            <p v-if="isEmbedded" class="loc-hint">
              The in-app browser you’re using doesn’t pass location through.
              Chrome does.
            </p>
          </template>

          <p v-if="locationState === 'denied' && isEmbedded" class="loc-hint">
            Tip: opening this page directly in Chrome makes the permission
            prompt work reliably.
          </p>

          <div class="loc-actions">
            <!-- Primary action varies by state -->
            <button
              v-if="locationState === 'stuck' && isAndroid"
              class="loc-btn loc-btn--primary"
              @click="openInChrome"
            >
              Open in Chrome
            </button>

            <button
              v-else-if="canRetry"
              class="loc-btn loc-btn--primary"
              :disabled="isRequesting"
              @click="requestLocation"
            >
              {{ actionLabel }}
            </button>

            <!-- Secondary retry for 'stuck' -->
            <button
              v-if="locationState === 'stuck'"
              class="loc-btn loc-btn--ghost"
              :disabled="isRequesting"
              @click="requestLocation"
            >
              {{ isRequesting ? 'Checking…' : 'Try again anyway' }}
            </button>

            <button class="loc-btn loc-btn--ghost" @click="dismissLocationModal">
              {{ canRetry ? 'Not now' : 'Got it' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.citizen-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--bg);
}

/* ---------- Tab stage ---------- */
.tab-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
}

.tab-stage--map {
  padding-bottom: 0;
}

.tab-stage:not(.tab-stage--map) {
  padding-top: calc(env(safe-area-inset-top, 0px) + 16px);
  padding-left: calc(20px + env(safe-area-inset-left, 0px));
  padding-right: calc(20px + env(safe-area-inset-right, 0px));
}

/* ---------- Profile sheet ---------- */
.profile-sheet {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  animation: slide-up 0.24s ease;
}

@keyframes slide-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

.profile-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: calc(env(safe-area-inset-top, 0px) + 12px);
  padding-bottom: 12px;
  padding-left: calc(20px + env(safe-area-inset-left, 0px));
  padding-right: calc(20px + env(safe-area-inset-right, 0px));
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

.profile-sheet__title {
  font-size: 1.125rem;
  font-weight: 700;
}

.profile-sheet__close {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  color: var(--text-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.profile-sheet__close:active {
  transform: scale(0.92);
}

.profile-sheet__body {
  flex: 1;
  overflow-y: auto;
  padding-top: calc(env(safe-area-inset-top, 0px) + 4px);
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
  padding-left: calc(20px + env(safe-area-inset-left, 0px));
  padding-right: calc(20px + env(safe-area-inset-right, 0px));
  max-width: 520px;
  width: 100%;
  margin-inline: auto;
}

/* Sheet transition */
.sheet-enter-active,
.sheet-leave-active {
  transition: transform 0.24s ease, opacity 0.24s ease;
}

.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

/* ---------- Location permission modal ---------- */
.loc-overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(12, 15, 22, 0.55);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
}

.loc-card {
  width: 100%;
  max-width: 380px;
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  background: var(--bg-elev, #fff);
  border: 1px solid var(--border);
  border-radius: 22px;
  padding: 26px 22px 20px;
  text-align: center;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
}

.loc-icon {
  width: 62px;
  height: 62px;
  margin: 0 auto 16px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--accent, var(--primary, #2f6bff));
  box-shadow: 0 8px 24px rgba(47, 107, 255, 0.32);
}

.loc-icon--warn {
  background: #ef8a17;
  box-shadow: 0 8px 24px rgba(239, 138, 23, 0.32);
}

.loc-title {
  font-size: 1.0625rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 8px;
}

.loc-text {
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--text-muted);
}

.loc-steps {
  margin: 16px 0 0;
  padding: 14px 14px 14px 32px;
  text-align: left;
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--text-muted);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px;
}

.loc-steps li + li {
  margin-top: 4px;
}

.loc-hint {
  margin-top: 10px;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--text-muted);
  opacity: 0.85;
}

.loc-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 20px;
}

.loc-btn {
  width: 100%;
  min-height: 48px;
  border-radius: 14px;
  border: 1px solid transparent;
  font-family: inherit;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.loc-btn:active {
  transform: scale(0.98);
}

.loc-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.loc-btn--primary {
  color: #fff;
  background: var(--accent, var(--primary, #2f6bff));
}

.loc-btn--ghost {
  color: var(--text-muted);
  background: transparent;
  border-color: var(--border);
}

/* Modal transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .loc-card,
.modal-leave-active .loc-card {
  transition: transform 0.24s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .loc-card,
.modal-leave-to .loc-card {
  transform: translateY(16px) scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  .loc-btn,
  .modal-enter-active,
  .modal-leave-active,
  .modal-enter-active .loc-card,
  .modal-leave-active .loc-card {
    transition: none;
  }
}
</style>
