<script setup>
import { ref, computed } from 'vue'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase'
import { useUsers } from '@/composables/useUsers'
import CreateEditUserModal from '@/components/admin/CreateEditUserModal.vue'

const { users, loading, error: loadError, restart } = useUsers()

const searchQuery = ref('')
const roleFilter = ref('all')
const statusFilter = ref('all')

const ROLE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'citizen', label: 'Citizens' },
  { key: 'responder', label: 'Responders' },
  { key: 'admin', label: 'Admins' },
]

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return users.value.filter((u) => {
    if (roleFilter.value !== 'all' && u.role !== roleFilter.value) return false
    if (statusFilter.value !== 'all' && u.status !== statusFilter.value) return false
    if (!q) return true
    return (
      (u.fullName || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q) ||
      (u.barangay || u.assignedBarangay || '').toLowerCase().includes(q)
    )
  })
})

// ---------------------------------------------------------------------------
// CREATE / EDIT
// ---------------------------------------------------------------------------
const showModal = ref(false)
const modalMode = ref('create')
const modalInitial = ref({})
const saving = ref(false)
const modalError = ref('')

function openCreate() {
  modalMode.value = 'create'
  modalInitial.value = { role: 'citizen' }
  modalError.value = ''
  showModal.value = true
}

function openEdit(user) {
  modalMode.value = 'edit'
  modalInitial.value = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.fullName || user.displayName || '',
    phone: user.phone || '',
    role: user.role || 'citizen',
    status: user.status || 'active',
    responderType: user.responderType || '',
    licenseNumber: user.licenseNumber || '',
    serviceArea: user.serviceArea || '',
    barangay: user.barangay || user.assignedBarangay || '',
    agency: user.agency || '',
    permissions: user.permissions || [],
  }
  modalError.value = ''
  showModal.value = true
}

async function handleSubmit(payload) {
  saving.value = true
  modalError.value = ''

  try {
    const { createUser, updateUser } = await import('@/services/adminUsers')

    if (modalMode.value === 'create') {
      const res = await createUser(payload)
      let msg = res.sms_ok
        ? 'User created. Reset link sent by SMS.'
        : 'User created.'
      if (res.resetLink) {
        try {
          await navigator.clipboard.writeText(res.resetLink)
          msg += ' Reset link copied to clipboard.'
        } catch {
          console.info('Reset link:', res.resetLink)
        }
      }
      showToast(msg)
    } else {
      await updateUser(payload.uid || modalInitial.value.uid, payload)
      showToast('User updated.')
    }

    showModal.value = false
    restart?.()
  } catch (e) {
    modalError.value = e.message || String(e)
  } finally {
    saving.value = false
  }
}

// ---------------------------------------------------------------------------
// DISABLE / ENABLE
// ---------------------------------------------------------------------------
const togglingId = ref(null)

async function toggleDisabled(user) {
  if (togglingId.value) return
  const next = !user.disabled
  if (next && !confirm(`Disable ${user.fullName}? They won't be able to sign in.`)) {
    return
  }

  togglingId.value = user.uid
  try {
    const resp = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/admin/toggle-user-status`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, disabled: next }),
      }
    )
    const data = await resp.json()
    if (!resp.ok || !data.ok) {
      alert(data.error || 'Could not update user.')
    } else {
      await updateDoc(doc(db, 'users', user.uid), {
        disabled: next,
        status: next ? 'suspended' : 'active',
        updatedAt: serverTimestamp(),
      })
    }
  } catch (e) {
    console.error('[UsersTab] toggle failed', e)
    alert('Network error. Try again.')
  } finally {
    togglingId.value = null
  }
}

// ---------------------------------------------------------------------------
// TOAST
// ---------------------------------------------------------------------------
const toastMessage = ref('')
const toastVisible = ref(false)

function showToast(msg) {
  toastMessage.value = msg
  toastVisible.value = true
  setTimeout(() => {
    toastVisible.value = false
    toastMessage.value = ''
  }, 3200)
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
const ROLE_LABELS = { citizen: 'Citizen', responder: 'Responder', admin: 'Admin' }
const ROLE_COLORS = { citizen: '#3b82f6', responder: '#2f9e73', admin: '#8b5cf6' }

function timeAgo(date) {
  if (!date) return 'Never'
  const d = date instanceof Date ? date : new Date(date)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function initials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('')
}
</script>

<template>
  <section class="users-tab">
    <header class="head">
      <div class="head-text">
        <h1 class="h1">Users</h1>
        <p class="muted">{{ users.length }} accounts registered.</p>
      </div>
      <button class="create-btn" @click="openCreate">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
          />
        </svg>
        <span>Create User</span>
      </button>
    </header>

    <div class="chips" role="tablist" aria-label="Filter by role">
      <button
        v-for="f in ROLE_TABS"
        :key="f.key"
        type="button"
        role="tab"
        class="chip"
        :class="{ 'chip--on': roleFilter === f.key }"
        :aria-selected="roleFilter === f.key"
        @click="roleFilter = f.key"
      >
        {{ f.label }}
      </button>
    </div>

    <div class="toolbar">
      <div class="search-wrap">
        <span class="search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
            <path
              d="m20 20-3.5-3.5"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </span>
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="Search by name, phone, email, barangay…"
        />
      </div>

      <select v-model="statusFilter" class="filter-select">
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="pending">Pending</option>
        <option value="suspended">Suspended</option>
      </select>
    </div>

    <div v-if="loading" class="state-block">
      <div class="spinner" />
      <p class="tiny">Loading users…</p>
    </div>

    <div v-else-if="loadError" class="state-block state-block--error">
      <p class="tiny">{{ loadError }}</p>
    </div>

    <div v-else-if="!filtered.length" class="state-block">
      <div class="state-icon" aria-hidden="true">🔍</div>
      <p class="state-title">No users match</p>
      <p class="tiny state-text">Try changing your filters or search.</p>
    </div>

    <ul v-else class="grid">
      <li
        v-for="u in filtered"
        :key="u.uid"
        class="user-card"
        :class="{ 'user-card--disabled': u.disabled }"
      >
        <div class="user-head">
          <span
            class="user-avatar"
            :style="{ background: ROLE_COLORS[u.role] || '#3b82f6' }"
            aria-hidden="true"
          >
            {{ initials(u.fullName || u.displayName) }}
          </span>
          <div class="user-body">
            <p class="user-name">
              {{ u.fullName || u.displayName || '—' }}
            </p>
            <p class="user-meta tiny">
              <span class="role-pill" :style="{ color: ROLE_COLORS[u.role] }">
                {{ ROLE_LABELS[u.role] || u.role }}
              </span>
              <template v-if="u.disabled"> · Disabled</template>
              <template v-else-if="u.mustChangeCredentials">
                · Awaiting setup
              </template>
            </p>
          </div>
          <span
            v-if="u.hasPendingUpdateRequest"
            class="pending-pill"
            title="User requested an update"
          >
            Update requested
          </span>
        </div>

        <div class="user-detail">
          <p class="detail-row tiny">
            <span class="detail-label">Email</span>
            <span class="detail-value">{{ u.email || '—' }}</span>
          </p>
          <p class="detail-row tiny">
            <span class="detail-label">Phone</span>
            <span class="detail-value">{{ u.phone || '—' }}</span>
          </p>
          <p v-if="u.role === 'responder'" class="detail-row tiny">
            <span class="detail-label">Barangay</span>
            <span class="detail-value">
              {{ u.barangay || u.assignedBarangay || '—' }}
            </span>
          </p>
          <p class="detail-row tiny">
            <span class="detail-label">Last online</span>
            <span class="detail-value">{{ timeAgo(u.lastSeen) }}</span>
          </p>
        </div>

        <div class="user-actions">
          <button class="mini-btn" @click="openEdit(u)">Edit</button>
          <button
            class="mini-btn"
            :class="{ 'mini-btn--danger': !u.disabled }"
            :disabled="togglingId === u.uid"
            @click="toggleDisabled(u)"
          >
            {{ u.disabled ? 'Enable' : 'Disable' }}
          </button>
        </div>
      </li>
    </ul>

    <CreateEditUserModal
      :open="showModal"
      :mode="modalMode"
      :initial="modalInitial"
      :saving="saving"
      :error-message="modalError"
      @close="showModal = false"
      @submit="handleSubmit"
    />

    <Transition name="fade">
      <div v-if="toastVisible" class="toast">{{ toastMessage }}</div>
    </Transition>
  </section>
</template>

<style scoped>
.users-tab { display: flex; flex-direction: column; padding-bottom: 20px; }

.head {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}
.head-text { min-width: 0; }
.head .h1 { font-size: 1.5rem; }
.head .muted { margin-top: 4px; }

.create-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 11px 16px;
  min-height: 44px;
  border-radius: 10px;
  background: #3b82f6;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 650;
  border: none;
  cursor: pointer;
  align-self: flex-start;
  transition: transform 0.15s ease;
  font-family: inherit;
}
.create-btn:active { transform: scale(0.96); }

.chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 6px;
  margin-bottom: 12px;
  scrollbar-width: none;
}
.chips::-webkit-scrollbar { display: none; }
.chip {
  flex-shrink: 0;
  padding: 7px 14px;
  border-radius: 99px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.8125rem;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  font-family: inherit;
}
.chip:active { transform: scale(0.96); }
.chip--on { background: #3b82f6; border-color: #3b82f6; color: #fff; }

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.search-wrap { position: relative; flex: 1; min-width: 0; }
.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-dim);
  pointer-events: none;
}
.search-input {
  width: 100%;
  min-height: 46px;
  padding: 12px 14px 12px 42px;
  font-size: 16px;
  background: var(--bg-input);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  outline: none;
  font-family: inherit;
}
.search-input:focus { border-color: #3b82f6; }

.filter-select {
  min-height: 46px;
  padding: 10px 14px;
  background: var(--bg-input);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 0.875rem;
  cursor: pointer;
  appearance: none;
  font-family: inherit;
}

.state-block {
  background: var(--bg-elev);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  padding: 40px 24px;
  text-align: center;
}
.state-block--error { border-color: rgba(239, 68, 68, 0.3); }
.spinner {
  width: 26px; height: 26px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: #3b82f6;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.state-icon { font-size: 2rem; margin-bottom: 10px; opacity: 0.8; }
.state-title { font-size: 0.9375rem; font-weight: 650; margin-bottom: 4px; }
.state-text { line-height: 1.5; max-width: 30ch; margin-inline: auto; }

.grid {
  list-style: none;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.user-card {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  transition: opacity 0.15s ease;
  display: flex;
  flex-direction: column;
}
.user-card--disabled { opacity: 0.55; }

.user-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.user-avatar {
  width: 40px; height: 40px;
  border-radius: 50%;
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 0.875rem;
  flex-shrink: 0;
}
.user-body { min-width: 0; flex: 1; }
.user-name {
  font-size: 0.9375rem;
  font-weight: 700;
  margin-bottom: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-meta { line-height: 1.4; }
.role-pill { font-weight: 700; }
.pending-pill {
  display: inline-block;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  border-radius: 99px;
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.35);
  flex-shrink: 0;
}

.user-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  flex: 1;
}
.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.detail-label { color: var(--text-muted); flex-shrink: 0; }
.detail-value {
  color: var(--text);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.user-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.mini-btn {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 700;
  background: rgba(59, 130, 246, 0.14);
  color: #3b82f6;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
  flex: 1;
}
.mini-btn:active { transform: scale(0.96); }
.mini-btn--danger { background: rgba(239, 68, 68, 0.14); color: #ef4444; }
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }

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
  max-width: min(360px, calc(100vw - 48px));
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (min-width: 480px) { .grid { grid-template-columns: repeat(2, 1fr); } }

@media (min-width: 640px) {
  .head {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }
  .head .h1 { font-size: 1.75rem; }
  .create-btn { align-self: flex-start; }
  .toolbar { flex-direction: row; align-items: center; }
  .filter-select { min-width: 180px; }
}

@media (min-width: 1024px) {
  .head .h1 { font-size: 2rem; }
  .head .muted { font-size: 1rem; }
  .grid { grid-template-columns: repeat(3, 1fr); gap: 14px; }
}

@media (min-width: 1440px) {
  .grid { grid-template-columns: repeat(4, 1fr); gap: 16px; }
}
</style>