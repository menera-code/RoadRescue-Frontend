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
 * Shows a blocking-ish modal when the device/browser has location
 * off or denied, so the user is forced to re-enable it.
 * ================================================================== */
const DISMISS_KEY = 'citizen:location-prompt-dismissed'

const showLocationModal = ref(false)
// 'prompt' | 'granted' | 'denied' | 'insecure' | 'unsupported'
const locationState = ref('prompt')
const isRequesting = ref(false)
const isEmbedded = ref(false)

let permissionStatus = null

const canUseGeolocation = () =>
  typeof navigator !== 'undefined' && 'geolocation' in navigator

/** Android WebView / in-app browsers (FB, IG, LINE…) handle permissions differently */
function detectEmbeddedBrowser() {
  const ua = navigator.userAgent || ''
  return (
    /Android/i.test(ua) &&
    (/;\s*wv\)/i.test(ua) || /FBAN|FBAV|Instagram|Line\//i.test(ua))
  )
}

async function syncPermissionState() {
  // Browsers refuse geolocation on plain http://
  if (!window.isSecureContext) {
    locationState.value = 'insecure'
    return
  }

  if (!canUseGeolocation()) {
    locationState.value = 'unsupported'
    return
  }

  // Safari / older WebViews have no Permissions API — assume we must ask
  if (!navigator.permissions?.query) {
    if (locationState.value !== 'granted') locationState.value = 'prompt'
    return
  }

  try {
    permissionStatus = await navigator.permissions.query({ name: 'geolocation' })
    locationState.value = permissionStatus.state

    permissionStatus.onchange = () => {
      locationState.value = permissionStatus.state
      if (permissionStatus.state === 'granted') {
        showLocationModal.value = false
      }
    }
  } catch {
    // Some browsers throw for the 'geolocation' descriptor
    if (locationState.value !== 'granted') locationState.value = 'prompt'
  }
}

/** Triggers the *native* permission prompt */
function requestLocation() {
  if (!canUseGeolocation()) {
    locationState.value = 'unsupported'
    return
  }

  isRequesting.value = true

  navigator.geolocation.getCurrentPosition(
    () => {
      isRequesting.value = false
      locationState.value = 'granted'
      showLocationModal.value = false
      sessionStorage.removeItem(DISMISS_KEY)
    },
    (error) => {
      isRequesting.value = false
      if (error.code === error.PERMISSION_DENIED) {
        // Permanently denied → the browser won't ask again, show instructions
        locationState.value = 'denied'
      }
      showLocationModal.value = true
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  )
}

function dismissLocationModal() {
  showLocationModal.value = false
  sessionStorage.setItem(DISMISS_KEY, '1')
}

/** Coming back from Android Settings → re-check the permission */
async function handleVisibility() {
  if (document.visibilityState !== 'visible') return

  await syncPermissionState()

  if (locationState.value === 'granted') {
    showLocationModal.value = false
    return
  }

  if (sessionStorage.getItem(DISMISS_KEY) !== '1') {
    showLocationModal.value = true
  }
}

onMounted(async () => {
  isEmbedded.value = detectEmbeddedBrowser()
  document.addEventListener('visibilitychange', handleVisibility)

  await syncPermissionState()

  if (locationState.value === 'granted') return
  if (sessionStorage.getItem(DISMISS_KEY) === '1') return

  showLocationModal.value = true
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibility)
  if (permissionStatus) permissionStatus.onchange = null
})

/* ---------- Modal copy ---------- */
const modalTitle = computed(() => {
  switch (locationState.value) {
    case 'denied':
      return 'Location access is blocked'
    case 'insecure':
      return 'Location needs a secure connection'
    case 'unsupported':
      return 'Location isn’t available'
    default:
      return 'Allow location access'
  }
})

const modalMessage = computed(() => {
  switch (locationState.value) {
    case 'denied':
      return 'Your phone is blocking location for this page, so the map and nearby reports can’t load. Turn it back on in your device settings.'
    case 'insecure':
      return 'Browsers only share your location over a secure (HTTPS) connection. Please reopen this page using https://.'
    case 'unsupported':
      return 'This device or browser doesn’t support location services.'
    default:
      return 'We use your location to show nearby reports on the map and to tag the exact spot on the reports you send. It’s only used while you’re using the app.'
  }
})

const canRetry = computed(() =>
  ['prompt', 'denied'].includes(locationState.value)
)

const actionLabel = computed(() => {
  if (isRequesting.value) return 'Checking…'
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
            :class="{ 'loc-icon--warn': locationState === 'denied' }"
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

          <p v-if="locationState === 'denied' && isEmbedded" class="loc-hint">
            Tip: open this page directly in Chrome for a smoother permission
            prompt.
          </p>

          <div class="loc-actions">
            <button
              v-if="canRetry"
              class="loc-btn loc-btn--primary"
              :disabled="isRequesting"
              @click="requestLocation"
            >
              {{ actionLabel }}
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
