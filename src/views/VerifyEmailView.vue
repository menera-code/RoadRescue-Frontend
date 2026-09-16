<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppLogo from '@/components/AppLogo.vue'

const router = useRouter()
const auth = useAuthStore()

const email = computed(() => auth.user?.email || '')
const sending = ref(false)
const checking = ref(false)
const resent = ref(false)
const error = ref('')
const cooldown = ref(0)

let pollTimer = null
let cooldownTimer = null

// Poll for verification every 5 seconds — auto-redirect when verified
onMounted(() => {
  pollTimer = setInterval(async () => {
    if (!auth.user) return
    try {
      await auth.reloadUser()
      if (auth.emailVerified) {
        clearInterval(pollTimer)
        router.replace({ name: 'dashboard' })
      }
    } catch (e) {
      // ignore transient errors
    }
  }, 5000)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (cooldownTimer) clearInterval(cooldownTimer)
})

async function resend() {
  if (sending.value || cooldown.value > 0) return
  sending.value = true
  error.value = ''
  resent.value = false

  try {
    await auth.resendVerification()
    resent.value = true
    startCooldown(60)
    setTimeout(() => (resent.value = false), 5000)
  } catch (e) {
    console.error('[VerifyEmail] resend failed', e)
    if (e.code === 'auth/too-many-requests') {
      error.value = 'Too many requests. Please wait a few minutes.'
    } else {
      error.value = 'Could not resend. Try again later.'
    }
  } finally {
    sending.value = false
  }
}

function startCooldown(seconds) {
  cooldown.value = seconds
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    cooldown.value--
    if (cooldown.value <= 0) clearInterval(cooldownTimer)
  }, 1000)
}

async function checkNow() {
  checking.value = true
  error.value = ''
  try {
    await auth.reloadUser()
    if (auth.emailVerified) {
      router.replace({ name: 'dashboard' })
    } else {
      error.value = 'Not verified yet. Click the link in your email first.'
    }
  } catch (e) {
    error.value = 'Could not check status. Try again.'
  } finally {
    checking.value = false
  }
}

async function signOut() {
  await auth.logout()
  router.replace({ name: 'home' })
}
</script>

<template>
  <main class="screen">
    <header class="head">
      <AppLogo :size="56" />
      <h1 class="h1">Check your email</h1>
      <p class="muted">
        We sent a verification link to your inbox.
      </p>
    </header>

    <!-- Email pill -->
    <div class="email-pill">
      <span class="email-icon" aria-hidden="true">✉️</span>
      <span class="email-text">{{ email }}</span>
    </div>

    <!-- Instructions -->
    <ol class="steps">
      <li>
        <span class="step-number">1</span>
        <span>Open Gmail (or your mail app)</span>
      </li>
      <li>
        <span class="step-number">2</span>
        <span>Find the email from RoadRescue</span>
      </li>
      <li>
        <span class="step-number">3</span>
        <span>Click the <strong>Verify Email</strong> button</span>
      </li>
    </ol>

    <div v-if="resent" class="toast toast--success">
      ✅ New email sent. Check your inbox.
    </div>

    <div v-if="error" class="toast toast--error">
      {{ error }}
    </div>

    <p class="tiny hint">
      Don't see it? Check your <strong>Spam</strong> or <strong>Promotions</strong>
      folder, and mark it as "Not spam" so future emails arrive correctly.
    </p>

    <div class="spacer" />

    <button
      class="btn btn--primary"
      :disabled="checking"
      @click="checkNow"
    >
      {{ checking ? 'Checking…' : "I've verified my email" }}
    </button>

    <button
      class="btn btn--soft"
      :disabled="sending || cooldown > 0"
      @click="resend"
    >
      {{
        sending
          ? 'Sending…'
          : cooldown > 0
          ? `Resend in ${cooldown}s`
          : 'Resend verification email'
      }}
    </button>

    <button class="btn btn--link" @click="signOut">
      Use a different account
    </button>
  </main>
</template>

<style scoped>
.screen {
  justify-content: flex-start;
}

.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding-top: 6vh;
  margin-bottom: 24px;
}
.head .h1 {
  margin-top: 12px;
  font-size: 1.5rem;
}
.head .muted {
  max-width: 32ch;
  line-height: 1.5;
}

.email-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 99px;
  margin: 0 auto 24px;
  max-width: 100%;
}
.email-icon {
  font-size: 1rem;
  flex-shrink: 0;
}
.email-text {
  font-size: 0.875rem;
  font-weight: 650;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.steps {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 20px;
}
.steps li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.9375rem;
  color: var(--text-muted);
  line-height: 1.4;
}
.step-number {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
}
.steps strong {
  color: var(--text);
  font-weight: 700;
}

.toast {
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: 0.875rem;
  line-height: 1.4;
  margin-bottom: 12px;
  text-align: center;
}
.toast--success {
  background: var(--accent-soft);
  border: 1px solid rgba(47, 158, 115, 0.3);
  color: var(--accent);
}
.toast--error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--danger);
}

.hint {
  text-align: center;
  line-height: 1.6;
  padding: 0 12px;
  margin-bottom: 24px;
}
.hint strong {
  color: var(--text-muted);
}

.spacer {
  flex: 1;
  min-height: 16px;
}

.screen .btn {
  margin-bottom: 10px;
}
</style>