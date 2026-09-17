<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppLogo from '@/components/AppLogo.vue'
import { TERMS_VERSION, TERMS_UPDATED } from '@/data/terms'

const router = useRouter()
const auth = useAuthStore()
const signingOut = ref(false)

const initials = computed(() => {
  const full = auth.profile?.fullName || ''
  return full.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('')
})

const profile = computed(() => auth.profile || {})

function formatDate(ts) {
  if (!ts) return '—'
  const d = ts instanceof Date ? ts : (ts.toDate ? ts.toDate() : new Date(ts))
  return d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
}

async function signOut() {
  if (signingOut.value) return
  signingOut.value = true
  try {
    await auth.logout()
    router.replace({ name: 'home' })
  } finally { signingOut.value = false }
}
</script>

<template>
  <section class="profile-tab">
    <header class="head">
      <h1 class="h1">Profile</h1>
      <p class="muted">Your administrator account.</p>
    </header>

    <div class="profile-layout">
      <!-- LEFT: hero identity card -->
      <aside class="hero-col">
        <div class="hero">
          <div class="avatar" aria-hidden="true">{{ initials || '⚡' }}</div>
          <h2 class="name">{{ profile.fullName || '—' }}</h2>
          <div class="badge-row">
            <span class="role-badge">Administrator</span>
            <span class="status-badge">
              <span class="status-dot" aria-hidden="true" />
              {{ profile.status || 'active' }}
            </span>
          </div>
        </div>
      </aside>

      <!-- RIGHT: details -->
      <div class="details-col">
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
            <span class="row-label">Role</span>
            <span class="row-value">Administrator</span>
          </div>
          <div class="row">
            <span class="row-label">Member since</span>
            <span class="row-value">{{ formatDate(profile.createdAt) }}</span>
          </div>
        </div>

        <div class="card card--small">
          <div class="row">
            <span class="row-label">Terms accepted</span>
            <span class="row-value">v{{ profile.termsVersion || TERMS_VERSION }}</span>
          </div>
          <p class="tiny terms-note">
            You agreed to Version {{ TERMS_VERSION }} ({{ TERMS_UPDATED }}) on
            {{ formatDate(profile.termsAcceptedAt) }}.
          </p>
        </div>

        <div class="actions">
          <button class="btn btn--primary" :disabled="signingOut" @click="signOut">
            {{ signingOut ? 'Signing out…' : 'Sign Out' }}
          </button>
        </div>

        <footer class="foot">
          <AppLogo :size="24" />
          <span class="tiny">RoadRescue · Admin</span>
        </footer>
      </div>
    </div>
  </section>
</template>

<style scoped>
.profile-tab { display: flex; flex-direction: column; }

.head { margin-bottom: 20px; }
.head .h1 { font-size: 1.5rem; }
.head .muted { margin-top: 4px; }

.profile-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Hero */
.hero-col { min-width: 0; }
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 0 22px;
}
.avatar {
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: linear-gradient(160deg, #4f8ff7 0%, #3b82f6 55%, #2563eb 100%);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 1.5rem;
  letter-spacing: 0.02em;
  box-shadow: 0 8px 20px rgba(59, 130, 246, 0.4);
}
.name {
  font-size: 1.125rem;
  font-weight: 700;
  margin-top: 4px;
  text-align: center;
}
.badge-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.role-badge {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.14);
  padding: 4px 10px;
  border-radius: 99px;
}
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 4px 10px;
  border-radius: 99px;
  background: var(--accent-soft);
  color: var(--accent);
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px currentColor;
  opacity: 0.4;
}

/* Details */
.details-col { min-width: 0; display: flex; flex-direction: column; }
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
.terms-note { line-height: 1.5; padding-top: 4px; }

.actions { margin-top: 4px; }
.actions .btn { width: 100%; }

.foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-top: 16px;
}

/* ============================================================
   RESPONSIVE
   ============================================================ */
@media (min-width: 640px) {
  .head .h1 { font-size: 1.75rem; }
  .actions .btn { width: auto; min-width: 200px; }
  .foot { justify-content: flex-start; }
}

@media (min-width: 1024px) {
  .head .h1 { font-size: 2rem; }
  .head .muted { font-size: 1rem; }

  .profile-layout {
    display: grid;
    grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }

  .hero-col {
    position: sticky;
    top: 24px;
  }

  .hero {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 32px 24px;
  }

  .avatar {
    width: 96px;
    height: 96px;
    font-size: 1.875rem;
  }
  .name { font-size: 1.25rem; margin-top: 12px; }
}

@media (min-width: 1440px) {
  .profile-layout {
    grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
    gap: 32px;
  }
  .hero { padding: 40px 28px; }
}
</style>