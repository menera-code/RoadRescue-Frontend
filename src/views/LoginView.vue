<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppLogo from '@/components/AppLogo.vue'
import TermsModal from '@/components/TermsModal.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const form = reactive({ email: '', password: '' })
const accepted = ref(false)
const showTerms = ref(false)
const loading = ref(false)
const error = ref('')
const resetSent = ref(false)

const canSubmit = computed(
  () => accepted.value && form.email && form.password && !loading.value
)

function humanizeError(code) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.'
    case 'auth/invalid-email':
      return 'Invalid email address.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Try again in a moment.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.'
    case 'auth/user-disabled':
      return 'This account has been disabled.'
    default:
      return 'Something went wrong. Please try again.'
  }
}

async function submit() {
  if (!canSubmit.value) return
  error.value = ''
  loading.value = true
  try {
    await auth.login(form.email.trim(), form.password)

    // Unverified CITIZENs must verify their email.
    // Responders and admins skip this (system-provisioned accounts).
    if (!auth.emailVerified && auth.role === 'citizen') {
      router.replace({ name: 'verify-email' })
      return
    }

    // Prefer the redirect query, else go to dashboard
    const redirect = route.query.redirect
    if (typeof redirect === 'string' && redirect.startsWith('/')) {
      router.replace(redirect)
    } else {
      router.replace({ name: 'dashboard' })
    }
  } catch (e) {
    error.value = humanizeError(e.code)
    loading.value = false
  }
}

async function forgot() {
  error.value = ''
  resetSent.value = false

  if (!form.email.trim()) {
    error.value = 'Enter your email first, then tap "Forgot password".'
    return
  }

  try {
    await auth.resetPassword(form.email.trim())
    resetSent.value = true
  } catch (e) {
    error.value = humanizeError(e.code)
  }
}
</script>

<template>
  <main class="screen">
    <header class="head">
      <AppLogo :size="64" />
      <h1 class="h1">Welcome back</h1>
      <p class="muted">Sign in to your RoadRescue account.</p>
    </header>

    <form class="stack" @submit.prevent="submit" novalidate>
      <div class="field">
        <label for="email">Email</label>
        <input
          id="email"
          v-model="form.email"
          type="email"
          inputmode="email"
          autocomplete="email"
          class="input"
          placeholder="you@example.com"
          required
        />
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input
          id="password"
          v-model="form.password"
          type="password"
          autocomplete="current-password"
          class="input"
          placeholder="••••••••"
          required
        />
      </div>

      <!-- Round checkbox for terms acceptance -->
      <div class="terms-row">
        <button
          type="button"
          class="round-check"
          :class="{ 'round-check--on': accepted }"
          role="checkbox"
          :aria-checked="accepted"
          aria-label="I accept the Terms and Agreements"
          @click="accepted = !accepted"
        >
          <svg
            v-if="accepted"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M5 13l4 4L19 7"
              stroke="#fff"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <p class="terms-text">
          I accept the
          <button type="button" class="link" @click="showTerms = true">
            Terms &amp; Agreements
          </button>
        </p>
      </div>

      <button type="button" class="btn btn--link" @click="forgot">
        Forgot password?
      </button>

      <p v-if="resetSent" class="success-text">
        Password reset email sent. Check your inbox.
      </p>

      <p v-if="error" class="error-text">{{ error }}</p>

      <button
        class="btn btn--primary"
        :disabled="!canSubmit"
        type="submit"
      >
        {{ loading ? 'Signing in…' : 'Sign In' }}
      </button>

      <div class="divider">or</div>

      <button
        type="button"
        class="btn btn--ghost"
        @click="router.push({ name: 'register' })"
      >
        Create a new account
      </button>
    </form>

    <TermsModal
      v-model="showTerms"
      :require-scroll="false"
      agree-label="Close"
      @accept="showTerms = false"
    />
  </main>
</template>

<style scoped>
.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  margin-bottom: 28px;
  padding-top: 4vh;
}

.head .h1 {
  margin-top: 12px;
}

.head .muted {
  max-width: 28ch;
}

.terms-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0 8px;
}

.round-check {
  width: 22px;
  height: 22px;
  min-width: 22px;
  border-radius: 50%;
  border: 2px solid var(--border);
  background: transparent;
  display: grid;
  place-items: center;
  transition: all 0.15s ease;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
}

.round-check:active {
  transform: scale(0.9);
}

.round-check--on {
  background: var(--primary);
  border-color: var(--primary);
}

.terms-text {
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.4;
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

.success-text {
  font-size: 0.8125rem;
  color: var(--accent);
  padding: 8px 12px;
  background: var(--accent-soft);
  border-radius: 10px;
}
</style>