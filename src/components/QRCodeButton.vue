<script setup>
import { computed, ref } from 'vue'
import QrcodeVue from 'qrcode.vue'

const showModal = ref(false)
const copied = ref(false)

// Current origin — auto-detects the deployed URL (or localhost in dev)
const currentUrl = computed(() => {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
})

function open() {
  showModal.value = true
}

function close() {
  showModal.value = false
}

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(currentUrl.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch (e) {
    console.warn('Copy failed', e)
  }
}
</script>

<template>
  <!-- Floating trigger button -->
  <button
    type="button"
    class="qr-fab"
    aria-label="Show QR code"
    @click="open"
  >
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <!-- QR corners -->
      <path
        d="M3 3h6v6H3V3zM15 3h6v6h-6V3zM3 15h6v6H3v-6z"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <!-- Inner dots -->
      <rect x="5" y="5" width="2" height="2" fill="currentColor" />
      <rect x="17" y="5" width="2" height="2" fill="currentColor" />
      <rect x="5" y="17" width="2" height="2" fill="currentColor" />
      <!-- Bottom-right data block -->
      <path
        d="M15 15h2v2h-2v-2zM19 15h2v2h-2v-2zM15 19h2v2h-2v-2zM19 19h2v2h-2v-2z"
        fill="currentColor"
      />
    </svg>
  </button>

  <!-- Modal -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showModal" class="qr-root" @click.self="close">
        <div class="qr-backdrop" @click="close" />

        <div class="qr-card">
          <button
            type="button"
            class="qr-close"
            aria-label="Close"
            @click="close"
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

          <div class="qr-head">
            <h2 class="qr-title">Scan to open RoadRescue</h2>
            <p class="qr-sub">
              Point your phone's camera at the code below to launch the app on
              your device.
            </p>
          </div>

          <div class="qr-code-wrap">
            <div class="qr-code">
              <QrcodeVue
                :value="currentUrl"
                :size="220"
                level="H"
                render-as="svg"
              />
            </div>
          </div>

          <div class="qr-url-row">
            <code class="qr-url">{{ currentUrl }}</code>
            <button
              type="button"
              class="qr-copy"
              :class="{ 'qr-copy--ok': copied }"
              @click="copyUrl"
            >
              {{ copied ? '✓ Copied' : 'Copy' }}
            </button>
          </div>

          <p class="qr-hint">
            Works with any camera app — iPhone, Android, or Google Lens.
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ============================================================
   FLOATING TRIGGER BUTTON
   ============================================================ */
.qr-fab {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 16px);
  right: 16px;
  z-index: 40;

  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-elev);
  color: var(--text);
  display: grid;
  place-items: center;
  cursor: pointer;

  transition: transform 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  -webkit-tap-highlight-color: transparent;
}

.qr-fab svg {
  width: 22px;
  height: 22px;
}

.qr-fab:hover {
  color: #f59e0b;
  border-color: rgba(245, 158, 11, 0.4);
}

.qr-fab:active {
  transform: scale(0.92);
}

/* ============================================================
   MODAL
   ============================================================ */
.qr-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.qr-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(6px);
}

.qr-card {
  position: relative;
  background: var(--bg-elev, #ffffff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 20px;
  padding: 28px 24px 22px;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
  animation: pop 0.22s ease;
  color: var(--text, #111827);
}

@keyframes pop {
  from {
    transform: scale(0.94);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.qr-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: transparent;
  border: none;
  color: var(--text-muted, #6b7280);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background 0.15s ease;
}

.qr-close:hover {
  background: rgba(0, 0, 0, 0.06);
}

.qr-head {
  text-align: center;
  margin-bottom: 18px;
  padding-right: 24px;
  padding-left: 24px;
}

.qr-title {
  font-size: 1.0625rem;
  font-weight: 700;
  margin-bottom: 6px;
  line-height: 1.3;
}

.qr-sub {
  font-size: 0.8125rem;
  color: var(--text-muted, #6b7280);
  line-height: 1.5;
}

.qr-code-wrap {
  display: flex;
  justify-content: center;
  padding: 6px 0 14px;
}

.qr-code {
  padding: 14px;
  background: #ffffff;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  display: grid;
  place-items: center;
}

.qr-code :deep(svg) {
  display: block;
  width: 220px;
  height: 220px;
}

.qr-url-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 8px 12px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 10px;
  margin-bottom: 12px;
}

.qr-url {
  flex: 1;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 0.6875rem;
  color: var(--text-muted, #6b7280);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.qr-copy {
  flex-shrink: 0;
  padding: 6px 10px;
  border-radius: 6px;
  border: none;
  background: #f59e0b;
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

.qr-copy:active {
  transform: scale(0.96);
}

.qr-copy--ok {
  background: #16a34a;
}

.qr-hint {
  text-align: center;
  font-size: 0.6875rem;
  color: var(--text-dim, #9ca3af);
  line-height: 1.5;
}

/* ============================================================
   TRANSITION
   ============================================================ */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ============================================================
   RESPONSIVE
   ============================================================ */
@media (min-width: 640px) {
  .qr-fab {
    top: calc(env(safe-area-inset-top, 0px) + 24px);
    right: 24px;
    width: 48px;
    height: 48px;
    border-radius: 14px;
  }
  .qr-fab svg {
    width: 24px;
    height: 24px;
  }
  .qr-card {
    padding: 32px 28px 24px;
  }
  .qr-title {
    font-size: 1.125rem;
  }
}

@media (min-width: 1024px) {
  .qr-fab {
    top: 28px;
    right: 32px;
  }
}
</style>