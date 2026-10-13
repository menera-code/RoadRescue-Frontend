<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppLogo from '@/components/AppLogo.vue'
import EditProfileModal from '@/components/EditProfileModal.vue'
import { updateMyProfile } from '@/services/profile'
import { TERMS_VERSION, TERMS_UPDATED } from '@/data/terms'

const router = useRouter()
const auth = useAuthStore()

const signingOut = ref(false)
const showEdit = ref(false)
const saving = ref(false)
const editError = ref('')
const toast = ref('')

const initials = computed(() => {
  const full = auth.profile?.fullName || ''
  return full
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('')
})

const profile = computed(() => auth.profile || {})

function formatDate(ts) {
  if (!ts) return '—'
  const d = ts instanceof Date ? ts : (ts.toDate ? ts.toDate() : new Date(ts))
  return d.toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function openEdit() {
  editError.value = ''
  showEdit.value = true
}

async function handleEdit(payload) {
  saving.value = true
  editError.value = ''
  try {
    await updateMyProfile(payload)
    if (auth.reloadProfile) await auth.reloadProfile()
    showEdit.value = false
    toast.value = 'Profile updated.'
    setTimeout(() => (toast.value = ''), 3000)
  } catch (e) {
    editError.value = e.message || 'Could not save. Try again.'
  } finally {
    saving.value = false
  }
}

async function signOut() {
  if (signingOut.value) return
  signingOut.value = true
  try {
    await auth.logout()
    router.replace({ name: 'home' })
  } finally {
    signingOut.value = false
  }
}
</script>

<template>
  <section class="profile-tab">
    <header class="head">
      <h1 class="h1">Profile</h1>
      <p class="muted">Your account details.</p>
    </header>

    <div class="hero">
      <div class="avatar" aria-hidden="true">{{ initials || '👤' }}</div>
      <h2 class="name">{{ profile.fullName || '—' }}</h2>
      <p class="role-badge">Citizen</p>
    </div>

    <div class="card">
      <div class="row">
        <span class="row-label">Email</span>
        <span class="row-value">{{ profile.email || '—' }}</span>
      </div>
      <div class="row">
        <span class="row-label">Phone</span>
        <span class="row-value">{{ profile.phone || 'Not set' }}</span>
      </div>
      <div class="row">
        <span class="row-label">Member since</span>
        <span class="row-value">{{ formatDate(profile.createdAt) }}</span>
      </div>
      <div class="row">
        <span class="row-label">Account status</span>
        <span class="row-value row-value--ok">
          {{ profile.status || 'active' }}
        </span>
      </div>
    </div>

    <div class="card card--small">
      <div class="row">
        <span class="row-label">Terms accepted</span>
        <span class="row-value">
          v{{ profile.termsVersion || TERMS_VERSION }}
        </span>
      </div>
      <p class="tiny terms-note">
        You agreed to Version {{ TERMS_VERSION }} ({{ TERMS_UPDATED }}) on
        {{ formatDate(profile.termsAcceptedAt) }}.
      </p>
    </div>

    <div class="spacer" />

    <button class="btn btn--ghost" @click="openEdit">Edit profile</button>

    <button
      class="btn btn--primary"
      :disabled="signingOut"
      @click="signOut"
    >
      {{ signingOut ? 'Signing out…' : 'Sign Out' }}
    </button>

    <footer class="foot">
      <AppLogo :size="24" />
      <span class="tiny">RoadRescue · v1.0</span>
    </footer>

    <EditProfileModal
      :open="showEdit"
      :profile="profile"
      :role="profile.role || 'citizen'"
      :saving="saving"
      :error-message="editError"
      @close="showEdit = false"
      @submit="handleEdit"
    />

    <Transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </Transition>
  </section>
</template>

<style scoped>
.profile-tab {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.head { margin-bottom: 20px; }
.head .h1 { font-size: 1.5rem; }
.head .muted { margin-top: 4px; }

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 0 24px;
}
.avatar {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 1.5rem;
  letter-spacing: 0.02em;
  box-shadow: 0 8px 20px rgba(230, 57, 70, 0.35);
}
.name {
  font-size: 1.125rem;
  font-weight: 700;
  margin-top: 4px;
  text-align: center;
}
.role-badge {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 4px 10px;
  border-radius: 99px;
}

.card {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 16px;
  margin-bottom: 12px;
}
.card--small { padding: 12px 16px; }
.row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 12px 0;
}
.row + .row { border-top: 1px solid var(--border); }
.row-label {
  font-size: 0.8125rem;
  color: var(--text-muted);
  flex-shrink: 0;
}
.row-value {
  font-size: 0.9375rem;
  color: var(--text);
  text-align: right;
  word-break: break-word;
  min-width: 0;
}
.row-value--ok {
  color: var(--accent);
  font-weight: 600;
  text-transform: capitalize;
}
.terms-note { line-height: 1.5; padding-top: 4px; }

.spacer {
  flex: 1;
  min-height: 16px;
}

.profile-tab .btn { margin-bottom: 10px; }
.profile-tab .btn:disabled { opacity: 0.5; }

.foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-top: 16px;
}

.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 12px 18px;
  border-radius: 10px;
  background: #16a34a;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 600;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  z-index: 2000;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>