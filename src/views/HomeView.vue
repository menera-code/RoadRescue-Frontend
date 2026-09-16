<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppLogo from '@/components/AppLogo.vue'
import TermsModal from '@/components/TermsModal.vue'

const router = useRouter()
const auth = useAuthStore()

const showTerms = ref(false)
const showResponderInfo = ref(false)

function getHelp() {
  if (auth.isAuthenticated) {
    router.push({ name: 'dashboard' })
    return
  }
  router.push({ name: 'register' })
}
</script>

<template>
  <main class="screen home">
    <div class="home-top">
      <AppLogo :size="96" />
      <h1 class="h1">RoadRescue</h1>
      <p class="muted">
        Roadside and emergency help, one tap away.
        Verified responders. Real-time tracking.
      </p>
    </div>

    <div class="home-actions stack">
      <button class="btn btn--primary" @click="getHelp">
        Get Help Now
      </button>
      <button class="btn btn--soft" @click="showResponderInfo = true">
        I'm a Responder
      </button>

      <div class="divider">or</div>

      <button
        v-if="!auth.isAuthenticated"
        class="btn btn--ghost"
        @click="router.push({ name: 'login' })"
      >
        Log In
      </button>
      <button
        v-else
        class="btn btn--ghost"
        @click="router.push({ name: 'dashboard' })"
      >
        Go to Dashboard
      </button>
    </div>

    <div class="spacer" />

    <footer class="home-foot tiny">
      By continuing you agree to our
      <button class="link" @click="showTerms = true">
        Terms &amp; Privacy Policy
      </button>.
    </footer>

    <!-- Terms modal (read-only) -->
    <TermsModal
      v-model="showTerms"
      :require-scroll="false"
      agree-label="Close"
      @accept="showTerms = false"
    />

    <!-- Responder info sheet -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showResponderInfo"
          class="modal-root"
          role="dialog"
          aria-modal="true"
          aria-label="Responder access information"
        >
          <div class="modal-backdrop" @click="showResponderInfo = false" />
          <div class="modal-card">
            <div class="modal-icon" aria-hidden="true">🚑</div>
            <h2 class="h2">Responder access is by invitation</h2>
            <p class="modal-text">
              RoadRescue responder accounts are created and verified by our
              administrators to keep citizens safe.
            </p>
            <p class="modal-text">
              If you're with an accredited emergency, roadside, or rescue
              organisation, contact your agency coordinator or email
              <strong>responders@roadrescue.app</strong> to request access.
            </p>
            <p class="modal-text">
              Once approved, you'll receive login credentials by email.
            </p>
            <button
              class="btn btn--primary"
              @click="showResponderInfo = false"
            >
              Got it
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </main>
</template>

<style scoped>
.home {
  text-align: center;
  justify-content: space-between;
}

.home-top {
  padding-top: 8vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.home-top .h1 {
  margin-top: 4px;
}

.home-top .muted {
  max-width: 30ch;
  margin-inline: auto;
  line-height: 1.5;
}

.home-actions {
  gap: 12px;
  margin-top: 40px;
}

.home-actions .divider {
  margin: 8px 0;
}

.home-foot {
  padding-top: 24px;
  line-height: 1.6;
}

.link {
  background: none;
  border: none;
  color: var(--primary);
  text-decoration: underline;
  padding: 0;
  font-size: inherit;
  cursor: pointer;
}

/* ---------- Info modal ---------- */
.modal-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
}

.modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.modal-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 26px 22px 20px;
  text-align: center;
  animation: pop 0.2s ease;
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

.modal-icon {
  font-size: 2.25rem;
  line-height: 1;
  margin-bottom: 10px;
}

.modal-card .h2 {
  margin-bottom: 12px;
  line-height: 1.3;
}

.modal-text {
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.55;
  margin-bottom: 12px;
  text-align: left;
}

.modal-text strong {
  color: var(--text);
  font-weight: 600;
}

.modal-card .btn {
  margin-top: 8px;
}
</style>