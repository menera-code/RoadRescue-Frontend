<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppLogo from '@/components/AppLogo.vue'

const router = useRouter()
const auth = useAuthStore()

const form = reactive({
  newEmail: '',
  newPassword: '',
  confirm: '',
})

const loading = ref(false)
const error = ref('')

const passwordsMatch = computed(
  () => !form.confirm || form.newPassword === form.confirm
)

const canSubmit = computed(
  () =>
    form.newEmail.trim().length >= 5 &&
    form.newPassword.length >= 8 &&
    form.newPassword === form.confirm &&
    !loading.value
)

async function submit() {
  if (!canSubmit.value) return
  error.value = ''
  loading.value = true

  try {
    await auth.completeSetup({
      newEmail: form.newEmail.trim(),
      newPassword: form.newPassword,
    })
    router.replace({ name: 'dashboard' })
  } catch (e) {
    console.error('[SetupAccount] failed', e)
    if (e.code === 'auth/requires-recent-login') {
      error.value =
        'For security, please sign out and sign in again with the temporary password before changing your details.'
    } else if (e.code === 'auth/email-already-in-use') {
      error.value = 'That email is already registered to another account.'
    } else if (e.code === 'auth/invalid-email') {
      error.value = 'That email address is invalid.'
    } else if (e.code === 'auth/weak-password') {
      error.value = 'Password is too weak. Use at least 8 characters.'
    } else {
      error.value = 'Could not update your account. Please try again.'
    }
    loading.value = false
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
      <h1 class="h1">Secure your account</h1>
      <p class="muted">
        You're signed in with a temporary credential. Set your real email
        and a new password to continue.
      </p>
    </header>

    <div class="info-card">
      <span class="info-icon" aria-hidden="true">🔒</span>
      <div>
        <p class="info-title">Why this step?</p>
        <p class="tiny info-text">
          Temporary credentials were sent by SMS. For your security,
          they must be replaced before you can use the responder dashboard.
        </p>
      </div>
    </div>

    <form class="stack" @submit.prevent="submit" novalidate>
      <div class="field">
        <label for="newEmail">Your real email</label>
        <input
          id="newEmail"
          v-model="form.newEmail"
          type="email"
          inputmode="email"
          autocomplete="email"
          class="input"
          placeholder="you@example.com"
          required
        />
      </div>

      <div class="field">
        <label for="newPassword">New password</label>
        <input
          id="newPassword"
          v-model="form.newPassword"
          type="password"
          autocomplete="new-password"
          class="input"
          placeholder="At least 8 characters"
          required
        />
      </div>

      <div class="field">
        <label for="confirm">Confirm password</label>
        <input
          id="confirm"
          v-model="form.confirm"
          type="password"
          autocomplete="new-password"
          :class="['input', { 'input--error': !passwordsMatch }]"
          placeholder="Re-enter your password"
          required
        />
        <p v-if="!passwordsMatch" class="error-text">Passwords do not match.</p>
      </div>

      <p v-if="error" class="error-text error-block">{{ error }}</p>

      <button class="btn btn--primary" type="submit" :disabled="!canSubmit">
        {{ loading ? 'Updating…' : 'Save and continue' }}
      </button>
    </form>

    <div class="spacer" />

    <button class="btn btn--link" @click="signOut">Sign out instead</button>
  </main>
</template>

<style scoped>
.screen { justify-content: flex-start; }
.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding-top: 5vh;
  margin-bottom: 20px;
}
.head .h1 { margin-top: 10px; font-size: 1.5rem; }
.head .muted { max-width: 36ch; line-height: 1.5; }

.info-card {
  display: flex;
  gap: 12px;
  padding: 14px;
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: var(--radius);
  margin-bottom: 22px;
}
.info-icon { font-size: 1.25rem; line-height: 1.2; flex-shrink: 0; }
.info-title {
  font-size: 0.875rem;
  font-weight: 700;
  color: #3b82f6;
  margin-bottom: 4px;
}
.info-text { line-height: 1.5; }

.error-block {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius);
  padding: 10px 14px;
  font-size: 0.8125rem;
  margin-bottom: 16px;
}

.spacer { flex: 1; min-height: 20px; }
</style>