<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useIncidents, STATUS_GROUPS } from '@/composables/useIncidents'
import AppLogo from '@/components/AppLogo.vue'
import { TERMS_VERSION, TERMS_UPDATED } from '@/data/terms'

const router = useRouter()
const auth = useAuthStore()

const signingOut = ref(false)

// ---------------------------------------------------------------------------
// LIVE STATS — subscription to all my incidents (any status)
// We compute counts client-side from the list. Cheap because responders
// have relatively few incidents, and it stays fresh in real time.
// ---------------------------------------------------------------------------
const { incidents: myIncidents, loading: statsLoading } = useIncidents({
  statuses: STATUS_GROUPS.ALL,
  scope: 'assignedToMe',
})

// ---------- Derived profile values ----------
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
const isVerified = computed(() => profile.value.status === 'active')
const isPending = computed(() => profile.value.status === 'pending')

// ---------- Stats ----------
const totalResponses = computed(() => myIncidents.value.length)

const resolvedCount = computed(() =>
  myIncidents.value.filter((i) => i.status === 'resolved').length
)

const thisWeekCount = computed(() => {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  return myIncidents.value.filter((i) => {
    if (i.status !== 'resolved' || !i.resolvedAt) return false
    const t = i.resolvedAt instanceof Date
      ? i.resolvedAt.getTime()
      : new Date(i.resolvedAt).getTime()
    return t >= weekAgo
  }).length
})

const avgResponseLabel = computed(() => {
  const resolved = myIncidents.value.filter(
    (i) => i.status === 'resolved' && i.acceptedAt && i.resolvedAt
  )
  if (!resolved.length) return '—'

  const durations = resolved.map((i) => {
    const a = i.acceptedAt instanceof Date
      ? i.acceptedAt.getTime()
      : new Date(i.acceptedAt).getTime()
    const r = i.resolvedAt instanceof Date
      ? i.resolvedAt.getTime()
      : new Date(i.resolvedAt).getTime()
    return (r - a) / 1000 / 60 // minutes
  })

  durations.sort((a, b) => a - b)
  const median = durations[Math.floor(durations.length / 2)]

  if (median < 1) return '<1 min'
  if (median < 60) return `${Math.round(median)} min`
  return `${(median / 60).toFixed(1)} hr`
})

// ---------------------------------------------------------------------------
// FORMATTING
// ---------------------------------------------------------------------------
function formatDate(ts) {
  if (!ts) return '—'
  const d = ts instanceof Date ? ts : (ts.toDate ? ts.toDate() : new Date(ts))
  return d.toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// ACTIONS
// ---------------------------------------------------------------------------
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
      <p class="muted">Your responder account and activity.</p>
    </header>

    <!-- ---------- Hero ---------- -->
    <div class="hero">
      <div class="avatar" aria-hidden="true">{{ initials || '🚑' }}</div>
      <h2 class="name">{{ profile.fullName || '—' }}</h2>

      <div class="badge-row">
        <span class="role-badge">Responder</span>
        <span
          class="status-badge"
          :class="{
            'status-badge--ok': isVerified,
            'status-badge--pending': isPending,
          }"
        >
          <span class="status-dot" aria-hidden="true" />
          {{ profile.status || 'unknown' }}
        </span>
      </div>
    </div>

    <!-- ---------- Stats grid ---------- -->
    <section class="stats">
      <div class="stat">
        <p class="stat-value">{{ statsLoading ? '—' : totalResponses }}</p>
        <p class="tiny stat-label">Responses</p>
      </div>
      <div class="stat">
        <p class="stat-value">
          {{ statsLoading ? '—' : resolvedCount }}
        </p>
        <p class="tiny stat-label">Resolved</p>
      </div>
      <div class="stat">
        <p class="stat-value">
          {{ statsLoading ? '—' : thisWeekCount }}
        </p>
        <p class="tiny stat-label">This week</p>
      </div>
      <div class="stat">
        <p class="stat-value">
          {{ statsLoading ? '—' : avgResponseLabel }}
        </p>
        <p class="tiny stat-label">Avg response</p>
      </div>
    </section>

    <!-- ---------- Account details ---------- -->
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
        <span class="row-label">Agency</span>
        <span class="row-value">{{ profile.agency || '—' }}</span>
      </div>
      <div v-if="profile.badgeId" class="row">
        <span class="row-label">Badge / ID</span>
        <span class="row-value">{{ profile.badgeId }}</span>
      </div>
      <div class="row">
        <span class="row-label">Barangay</span>
        <span class="row-value">
          {{ profile.barangay || profile.assignedBarangay || '—' }}
        </span>
      </div>
      <div class="row">
        <span class="row-label">Member since</span>
        <span class="row-value">{{ formatDate(profile.createdAt) }}</span>
      </div>
    </div>

    <!-- ---------- Terms ---------- -->
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

    <!-- ---------- Actions ---------- -->
    <button class="btn btn--ghost" disabled>
      Edit profile (coming soon)
    </button>

    <button
      class="btn btn--primary"
      :disabled="signingOut"
      @click="signOut"
    >
      {{ signingOut ? 'Signing out…' : 'Sign Out' }}
    </button>

    <footer class="foot">
      <AppLogo :size="24" />
      <span class="tiny">RoadRescue · Responder</span>
    </footer>
  </section>
</template>

<style scoped>
.profile-tab {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.head {
  margin-bottom: 20px;
}

.head .h1 {
  font-size: 1.5rem;
}

.head .muted {
  margin-top: 4px;
}

/* ---------- Hero ---------- */
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
  background: linear-gradient(
    160deg,
    #3cb886 0%,
    var(--accent) 55%,
    #267a58 100%
  );
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 1.5rem;
  letter-spacing: 0.02em;
  box-shadow: 0 8px 20px rgba(47, 158, 115, 0.35);
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
  color: var(--accent);
  background: var(--accent-soft);
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
  background: var(--bg-input);
  color: var(--text-muted);
}

.status-badge--ok {
  color: var(--accent);
  background: var(--accent-soft);
}

.status-badge--pending {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.14);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px currentColor;
  opacity: 0.4;
}

/* ---------- Stats ---------- */
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.stat {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 8px;
  text-align: center;
}

.stat-value {
  font-size: 1.0625rem;
  font-weight: 750;
  color: var(--text);
  line-height: 1.1;
  margin-bottom: 2px;
  letter-spacing: -0.01em;
}

.stat-label {
  line-height: 1.2;
}

/* ---------- Cards ---------- */
.card {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px 16px;
  margin-bottom: 12px;
}

.card--small {
  padding: 12px 16px;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 12px 0;
}

.row + .row {
  border-top: 1px solid var(--border);
}

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

.terms-note {
  line-height: 1.5;
  padding-top: 4px;
}

/* ---------- Actions ---------- */
.spacer {
  flex: 1;
  min-height: 16px;
}

.profile-tab .btn {
  margin-bottom: 10px;
}

.profile-tab .btn:disabled {
  opacity: 0.5;
}

.foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-top: 16px;
}
</style>