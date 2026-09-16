<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppLogo from '@/components/AppLogo.vue'
import TermsModal from '@/components/TermsModal.vue'
import { TERMS_VERSION } from '@/data/terms'

const router = useRouter()
const auth = useAuthStore()

const form = reactive({
  fullName: '',
  email: '',
  phone: '',
  password: '',
  confirm: '',
})

const accepted = ref(false)
const showTerms = ref(false)
const loading = ref(false)
const error = ref('')

const passwordsMatch = computed(
  () => !form.confirm || form.password === form.confirm
)

function validate() {
  if (!form.fullName.trim()) return 'Enter your full name.'
  if (!form.email.trim()) return 'Enter your email.'
  if (form.password.length < 8) return 'Password must be at least 8 characters.'
  if (form.password !== form.confirm) return 'Passwords do not match.'
  return null
}

async function onCreate() {
  error.value = validate() || ''
  if (error.value) return

  // If terms not yet accepted → open the modal
  if (!accepted.value) {
    showTerms.value = true
    return
  }

  await doRegister()
}

function onTermsAccept() {
  accepted.value = true
  doRegister()
}

function onTermsDecline() {
  accepted.value = false
}

async function doRegister() {
  loading.value = true
  error.value = ''

  try {
    await auth.register({
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      password: form.password,
      termsVersion: TERMS_VERSION,
    })

    router.replace({ name: 'dashboard' })
  } catch (e) {
    switch (e.code) {
      case 'auth/email-already-in-use':
        error.value = 'That email is already registered. Try logging in instead.'
        break
      case 'auth/weak-password':
        error.value = 'Password is too weak. Use at least 8 characters.'
        break
      case 'auth/invalid-email':
        error.value = 'Invalid email address.'
        break
      case 'auth/network-request-failed':
        error.value = 'Network error. Check your connection.'
        break
      default:
        error.value = e.message || 'Registration failed. Please try again.'
    }
    loading.value = false
  }
}
</script>

<template>
  <main class="screen">
    <header class="head">
      <AppLogo :size="56" />
      <h1 class="h1">Create your account</h1>
      <p class="muted">Join RoadRescue in under a minute.</p>
    </header>

    <form class="stack" @submit.prevent="onCreate" novalidate>
      <div class="field">
        <label for="fullName">Full name</label>
        <input
          id="fullName"
          v-model="form.fullName"
          class="input"
          autocomplete="name"
          placeholder="Juan Dela Cruz"
          required
        />
      </div>

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
        <label for="phone">Phone (optional)</label>
        <input
          id="phone"
          v-model="form.phone"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          class="input"
          placeholder="+63 917 123 4567"
        />
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input
          id="password"
          v-model="form.password"
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
        <p v-if="!passwordsMatch" class="error-text">
          Passwords do not match.
        </p>
      </div>

      <p v-if="error" class="error-text">{{ error }}</p>

      <button
        class="btn btn--primary"
        type="submit"
        :disabled="loading"
      >
        {{ loading ? 'Creating account…' : 'Create Account' }}
      </button>

      <p class="tiny center">
        You'll be asked to review and accept our
        Terms &amp; Privacy Policy.
      </p>

      <div class="divider">or</div>

      <button
        type="button"
        class="btn btn--ghost"
        @click="router.push({ name: 'login' })"
      >
        Already have an account? Log in
      </button>
    </form>

    <TermsModal
      v-model="showTerms"
      :require-scroll="true"
      agree-label="I Agree & Continue"
      @accept="onTermsAccept"
      @decline="onTermsDecline"
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
  margin-bottom: 22px;
  padding-top: 3vh;
}

.head .h1 {
  margin-top: 8px;
}

.head .muted {
  max-width: 30ch;
}

.center {
  text-align: center;
}
</style>