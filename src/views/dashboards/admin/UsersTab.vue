<script setup>
import { ref, reactive, computed } from 'vue'
import { useUsers } from '@/composables/useUsers'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const { users, loading } = useUsers()

// ---------------------------------------------------------------------------
// FILTERS
// ---------------------------------------------------------------------------
const searchQuery = ref('')
const roleFilter = ref('all')
const statusFilter = ref('all')

const ROLE_TABS = [
  { key: 'all',       label: 'All' },
  { key: 'citizen',   label: 'Citizens' },
  { key: 'responder', label: 'Responders' },
  { key: 'admin',     label: 'Admins' },
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
// INVITE MODAL
// ---------------------------------------------------------------------------
const showInvite = ref(false)
const invite = reactive({
  fullName: '',
  phone: '',
  barangay: '',
  agency: '',
})
const inviting = ref(false)
const inviteError = ref('')
const inviteSuccess = ref(null)

function openInvite() {
  invite.fullName = ''
  invite.phone = ''
  invite.barangay = ''
  invite.agency = ''
  inviteError.value = ''
  inviteSuccess.value = null
  showInvite.value = true
}

async function submitInvite() {
  inviteError.value = ''
  inviteSuccess.value = null

  if (!invite.fullName.trim()) return (inviteError.value = 'Full name is required.')
  if (!invite.phone.trim()) return (inviteError.value = 'Phone number is required.')
  if (!invite.barangay.trim()) return (inviteError.value = 'Barangay is required.')

  inviting.value = true
  try {
    const resp = await fetch(`${API_URL}/admin/invite-responder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: invite.fullName.trim(),
        phone: invite.phone.trim(),
        barangay: invite.barangay.trim(),
        agency: invite.agency.trim() || null,
      }),
    })
    const data = await resp.json()
    if (!resp.ok || !data.ok) {
      inviteError.value = data.message || 'Invite failed.'
      return
    }
    inviteSuccess.value = {
      tempEmail: data.tempEmail,
      tempPassword: data.tempPassword,
      smsOk: data.sms_ok,
      smsError: data.sms_error,
    }
  } catch (e) {
    console.error('[UsersTab] invite failed', e)
    inviteError.value = 'Could not reach server. Try again.'
  } finally {
    inviting.value = false
  }
}

// ---------------------------------------------------------------------------
// STATUS TOGGLE
// ---------------------------------------------------------------------------
const togglingId = ref(null)

async function toggleDisabled(user) {
  if (togglingId.value) return
  const next = !user.disabled
  if (next && !confirm(`Disable ${user.fullName}? They won't be able to sign in.`)) return

  togglingId.value = user.uid
  try {
    const resp = await fetch(`${API_URL}/admin/toggle-user-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid, disabled: next }),
    })
    const data = await resp.json()
    if (!resp.ok || !data.ok) {
      alert(data.error || 'Could not update user.')
    }
  } catch (e) {
    alert('Network error. Try again.')
  } finally {
    togglingId.value = null
  }
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
const ROLE_LABELS = {
  citizen: 'Citizen',
  responder: 'Responder',
  admin: 'Admin',
}

const ROLE_COLORS = {
  citizen: '#3b82f6',
  responder: '#2f9e73',
  admin: '#8b5cf6',
}

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
      <div>
        <h1 class="h1">Users</h1>
        <p class="muted">{{ users.length }} accounts registered.</p>
      </div>
      <button class="invite-btn" @click="openInvite">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
          />
        </svg>
        <span>Invite Responder</span>
      </button>
    </header>

    <div class="chips" role="tablist">
      <button
        v-for="f in ROLE_TABS"
        :key="f.key"
        type="button"
        class="chip"
        :class="{ 'chip--on': roleFilter === f.key }"
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

    <div v-else-if="!filtered.length" class="state-block">
      <div class="state-icon" aria-hidden="true">🔍</div>
      <p class="state-title">No users match</p>
      <p class="tiny state-text">Try changing your filters or search.</p>
    </div>

    <ul v-else class="list">
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
            {{ initials(u.fullName) }}
          </span>
          <div class="user-body">
            <p class="user-name">{{ u.fullName || '—' }}</p>
            <p class="user-meta tiny">
              <span class="role-pill" :style="{ color: ROLE_COLORS[u.role] }">
                {{ ROLE_LABELS[u.role] || u.role }}
              </span>
              <template v-if="u.disabled"> · Disabled</template>
              <template v-else-if="u.mustChangeCredentials"> · Awaiting setup</template>
            </p>
          </div>
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

    <!-- INVITE MODAL -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showInvite" class="modal-root" @click.self="showInvite = false">
          <div class="modal-backdrop" @click="showInvite = false" />

          <div class="modal-sheet">
            <div class="modal-grabber" />

            <header class="modal-head">
              <div>
                <h2 class="h2">Invite Responder</h2>
                <p class="tiny">
                  A temporary email and password will be created and sent by SMS.
                </p>
              </div>
              <button
                class="modal-close"
                aria-label="Close"
                @click="showInvite = false"
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
            </header>

            <div class="modal-body">
              <div v-if="inviteSuccess" class="success-panel">
                <div class="success-icon" aria-hidden="true">✅</div>
                <h3 class="success-title">Invitation sent</h3>
                <p class="tiny success-text">
                  <template v-if="inviteSuccess.smsOk">
                    An SMS with the login credentials was delivered to the responder.
                  </template>
                  <template v-else>
                    SMS delivery failed ({{ inviteSuccess.smsError }}). Share these credentials manually:
                  </template>
                </p>
                <div class="creds">
                  <p class="cred-row">
                    <span class="cred-label">Email</span>
                    <code class="cred-value">{{ inviteSuccess.tempEmail }}</code>
                  </p>
                  <p class="cred-row">
                    <span class="cred-label">Password</span>
                    <code class="cred-value">{{ inviteSuccess.tempPassword }}</code>
                  </p>
                </div>
                <p class="tiny note">
                  The responder will be required to change these on first login.
                </p>
                <button class="btn btn--primary" @click="showInvite = false">
                  Close
                </button>
              </div>

              <template v-else>
                <div class="field">
                  <label for="fullName">Full name</label>
                  <input
                    id="fullName"
                    v-model="invite.fullName"
                    class="input"
                    placeholder="Juan Dela Cruz"
                  />
                </div>

                <div class="field">
                  <label for="phone">Phone number (for SMS)</label>
                  <input
                    id="phone"
                    v-model="invite.phone"
                    type="tel"
                    inputmode="tel"
                    class="input"
                    placeholder="+63 917 123 4567"
                  />
                </div>

                <div class="field">
                  <label for="barangay">Barangay</label>
                  <input
                    id="barangay"
                    v-model="invite.barangay"
                    class="input"
                    placeholder="Ilaya (Poblacion)"
                  />
                </div>

                <div class="field">
                  <label for="agency">Agency (optional)</label>
                  <input
                    id="agency"
                    v-model="invite.agency"
                    class="input"
                    placeholder="Barangay Ilaya"
                  />
                </div>

                <p v-if="inviteError" class="error-text invite-error">
                  {{ inviteError }}
                </p>

                <button
                  class="btn btn--primary"
                  :disabled="inviting"
                  @click="submitInvite"
                >
                  {{ inviting ? 'Creating…' : 'Create & Send SMS' }}
                </button>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.users-tab { display: flex; flex-direction: column; padding-bottom: 20px; }

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.head .h1 { font-size: 1.5rem; }
.head .muted { margin-top: 4px; }

.invite-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 10px;
  background: #3b82f6;
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 650;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.invite-btn:active { transform: scale(0.96); }

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
}
.chip:active { transform: scale(0.96); }
.chip--on { background: #3b82f6; border-color: #3b82f6; color: #fff; }

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
@media (min-width: 640px) {
  .toolbar { flex-direction: row; align-items: center; }
}
.search-wrap { position: relative; flex: 1; }
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
}

.state-block {
  background: var(--bg-elev);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  padding: 40px 24px;
  text-align: center;
}
.spinner {
  width: 26px;
  height: 26px;
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

.list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.user-card {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  transition: opacity 0.15s ease;
}
.user-card--disabled { opacity: 0.55; }

.user-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.user-avatar {
  width: 40px;
  height: 40px;
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

.user-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.detail-row { display: flex; justify-content: space-between; gap: 12px; }
.detail-label { color: var(--text-muted); flex-shrink: 0; }
.detail-value {
  color: var(--text);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.user-actions { display: flex; gap: 8px; margin-top: 12px; }
.mini-btn {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 700;
  background: rgba(47, 158, 115, 0.14);
  color: #2f9e73;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}
.mini-btn:active { transform: scale(0.96); }
.mini-btn--danger {
  background: rgba(239, 68, 68, 0.14);
  color: #ef4444;
}

/* MODAL */
.modal-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
}
.modal-sheet {
  position: relative;
  background: var(--bg-elev);
  border-top-left-radius: 22px;
  border-top-right-radius: 22px;
  border: 1px solid var(--border);
  border-bottom: none;
  display: flex;
  flex-direction: column;
  max-height: 92dvh;
  padding-bottom: var(--sab);
  animation: sheet-up 0.24s ease;
}
@keyframes sheet-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.modal-grabber {
  width: 40px;
  height: 4px;
  background: var(--border);
  border-radius: 99px;
  margin: 8px auto 4px;
}
.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 20px 14px;
  border-bottom: 1px solid var(--border);
}
.modal-close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-input);
  border: none;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px 24px;
}

.success-panel { text-align: center; padding: 12px 4px 4px; }
.success-icon { font-size: 2.5rem; margin-bottom: 8px; }
.success-title { font-size: 1.125rem; font-weight: 700; margin-bottom: 8px; }
.success-text { line-height: 1.5; max-width: 34ch; margin: 0 auto 18px; }

.creds {
  background: var(--bg-input);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 12px;
  text-align: left;
}
.cred-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
}
.cred-row + .cred-row {
  border-top: 1px solid var(--border);
  margin-top: 4px;
}
.cred-label {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.06em;
}
.cred-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8125rem;
  color: var(--text);
  word-break: break-all;
  text-align: right;
}
.note { line-height: 1.5; max-width: 36ch; margin: 0 auto 16px; }

.invite-error { margin-bottom: 12px; text-align: center; }

.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>