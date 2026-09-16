<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import { BARANGAY_NAMES } from '@/data/barangays'

const auth = useAuthStore()

// =========================================================================
// SLUG HELPER
// =========================================================================
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// =========================================================================
// STATE — barangays
// =========================================================================
const barangayDocs = ref({})        // Map<slug, { responderUid, name, phone, ... }>
const loadingBarangays = ref(true)

let unsubBarangays = null

function subscribeBarangays() {
  const col = collection(db, 'barangays')
  unsubBarangays = onSnapshot(
    col,
    (snap) => {
      const next = {}
      snap.forEach((d) => {
        next[d.id] = { id: d.id, ...d.data() }
      })
      barangayDocs.value = next
      loadingBarangays.value = false
    },
    (err) => {
      console.error('[BarangaysTab] snapshot error', err)
      loadingBarangays.value = false
    }
  )
}

// =========================================================================
// STATE — responders
// =========================================================================
const responders = ref([])
const loadingResponders = ref(true)

let unsubResponders = null

function subscribeResponders() {
  // Only active responders who can be assigned
  const q = query(
    collection(db, 'users'),
    where('role', '==', 'responder'),
    where('status', '==', 'active')
  )
  unsubResponders = onSnapshot(
    q,
    (snap) => {
      const list = []
      snap.forEach((d) => {
        const data = d.data()
        list.push({
          uid: d.id,
          fullName: data.fullName || '',
          phone: data.phone || '',
          agency: data.agency || '',
        })
      })
      list.sort((a, b) =>
        (a.fullName || '').localeCompare(b.fullName || '')
      )
      responders.value = list
      loadingResponders.value = false
    },
    (err) => {
      console.error('[BarangaysTab] responders snapshot error', err)
      loadingResponders.value = false
    }
  )
}

// =========================================================================
// MERGED VIEW — combine static list with Firestore assignments
// =========================================================================
const mergedBarangays = computed(() => {
  return BARANGAY_NAMES.map((name) => {
    const slug = slugify(name)
    const doc = barangayDocs.value[slug] || {}
    return {
      name,
      slug,
      responderUid: doc.responderUid || null,
      responderName: doc.responderName || null,
      responderPhone: doc.responderPhone || null,
      assignedAt: doc.assignedAt || null,
    }
  })
})

const assignedCount = computed(
  () => mergedBarangays.value.filter((b) => b.responderUid).length
)

const totalCount = computed(() => mergedBarangays.value.length)

// =========================================================================
// SEARCH + FILTER
// =========================================================================
const searchQuery = ref('')
const filterMode = ref('all') // 'all' | 'unassigned' | 'assigned'

const visibleBarangays = computed(() => {
  let list = mergedBarangays.value

  if (filterMode.value === 'unassigned') {
    list = list.filter((b) => !b.responderUid)
  } else if (filterMode.value === 'assigned') {
    list = list.filter((b) => b.responderUid)
  }

  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.responderName || '').toLowerCase().includes(q)
    )
  }

  return list
})

// =========================================================================
// ASSIGN FLOW
// =========================================================================
const showAssignModal = ref(false)
const selectedBarangay = ref(null)   // { name, slug, responderUid, ... }
const responderQuery = ref('')
const assigning = ref(false)
const actionError = ref('')

const filteredResponders = computed(() => {
  const q = responderQuery.value.trim().toLowerCase()
  if (!q) return responders.value
  return responders.value.filter(
    (r) =>
      r.fullName.toLowerCase().includes(q) ||
      r.phone.toLowerCase().includes(q) ||
      r.agency.toLowerCase().includes(q)
  )
})

function openAssign(barangay) {
  selectedBarangay.value = barangay
  responderQuery.value = ''
  actionError.value = ''
  showAssignModal.value = true
}

function closeAssign() {
  showAssignModal.value = false
  selectedBarangay.value = null
  responderQuery.value = ''
}

async function assignResponder(responder) {
  if (!selectedBarangay.value || assigning.value) return

  assigning.value = true
  actionError.value = ''

  try {
    // 1. Update the barangay doc
    const bRef = doc(db, 'barangays', selectedBarangay.value.slug)
    const bSnap = await getDoc(bRef)

    const payload = {
      responderUid: responder.uid,
      responderName: responder.fullName,
      responderPhone: responder.phone,
      assignedAt: serverTimestamp(),
      assignedBy: auth.user?.uid,
      updatedAt: serverTimestamp(),
    }

    if (bSnap.exists()) {
      await updateDoc(bRef, payload)
    } else {
      // Shouldn't happen (we seeded them), but be safe
      const { setDoc } = await import('firebase/firestore')
      await setDoc(bRef, {
        name: selectedBarangay.value.name,
        slug: selectedBarangay.value.slug,
        ...payload,
      })
    }

    // 2. Optionally mirror onto the responder's user doc
    try {
      const uRef = doc(db, 'users', responder.uid)
      await updateDoc(uRef, {
        assignedBarangay: selectedBarangay.value.name,
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      // Non-fatal — the assignment above is what matters
      console.warn('[BarangaysTab] could not update user doc', e)
    }

    closeAssign()
  } catch (e) {
    console.error('[BarangaysTab] assign failed', e)
    actionError.value = 'Could not assign. Try again.'
  } finally {
    assigning.value = false
  }
}

// =========================================================================
// CLEAR ASSIGNMENT
// =========================================================================
async function clearAssignment(barangay) {
  if (!barangay.responderUid) return
  if (!confirm(
    `Remove ${barangay.responderName} from ${barangay.name}?`
  )) return

  try {
    const bRef = doc(db, 'barangays', barangay.slug)
    await updateDoc(bRef, {
      responderUid: null,
      responderName: null,
      responderPhone: null,
      assignedAt: null,
      updatedAt: serverTimestamp(),
    })

    // Clear the mirror on the responder's user doc
    try {
      const uRef = doc(db, 'users', barangay.responderUid)
      await updateDoc(uRef, {
        assignedBarangay: null,
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      console.warn('[BarangaysTab] could not clear user doc', e)
    }
  } catch (e) {
    console.error('[BarangaysTab] clear failed', e)
    alert('Could not clear assignment. Try again.')
  }
}

// =========================================================================
// LIFECYCLE
// =========================================================================
onMounted(() => {
  subscribeBarangays()
  subscribeResponders()
})

onBeforeUnmount(() => {
  if (unsubBarangays) unsubBarangays()
  if (unsubResponders) unsubResponders()
})
</script>

<template>
  <section class="barangays-tab">
    <!-- Header -->
    <header class="head">
      <h1 class="h1">Barangays</h1>
      <p class="muted">
        Assign one responder per barangay. Dispatched incidents route to them.
      </p>
    </header>

    <!-- Summary card -->
    <div class="summary-card">
      <div class="summary-stat">
        <p class="summary-value">{{ assignedCount }}</p>
        <p class="tiny summary-label">Assigned</p>
      </div>
      <div class="summary-divider" />
      <div class="summary-stat">
        <p class="summary-value summary-value--warn">
          {{ totalCount - assignedCount }}
        </p>
        <p class="tiny summary-label">Unassigned</p>
      </div>
      <div class="summary-divider" />
      <div class="summary-stat">
        <p class="summary-value">{{ totalCount }}</p>
        <p class="tiny summary-label">Total</p>
      </div>
    </div>

    <!-- Filter chips -->
    <div class="chips" role="tablist">
      <button
        v-for="f in [
          { key: 'all', label: 'All' },
          { key: 'unassigned', label: 'Unassigned' },
          { key: 'assigned', label: 'Assigned' },
        ]"
        :key="f.key"
        type="button"
        role="tab"
        :aria-selected="filterMode === f.key"
        class="chip"
        :class="{ 'chip--on': filterMode === f.key }"
        @click="filterMode = f.key"
      >
        {{ f.label }}
      </button>
    </div>

    <!-- Search -->
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
        placeholder="Search barangay or responder…"
      />
    </div>

    <!-- Loading -->
    <div v-if="loadingBarangays" class="state-block">
      <div class="state-spinner" aria-hidden="true" />
      <p class="tiny">Loading barangays…</p>
    </div>

    <!-- Empty search -->
    <div v-else-if="!visibleBarangays.length" class="state-block">
      <div class="state-icon" aria-hidden="true">🔍</div>
      <p class="state-title">No matches</p>
      <p class="tiny state-text">
        Try a different search or filter.
      </p>
    </div>

    <!-- List -->
    <ul v-else class="list">
      <li
        v-for="b in visibleBarangays"
        :key="b.slug"
        class="barangay-card"
        :class="{ 'barangay-card--assigned': b.responderUid }"
      >
        <div class="barangay-head">
          <span class="barangay-name">{{ b.name }}</span>
          <span
            class="barangay-status"
            :class="b.responderUid ? 'barangay-status--ok' : 'barangay-status--warn'"
          >
            {{ b.responderUid ? 'Assigned' : 'Unassigned' }}
          </span>
        </div>

        <!-- Assigned -->
        <div v-if="b.responderUid" class="barangay-body">
          <div class="responder-row">
            <span class="responder-icon" aria-hidden="true">👤</span>
            <div class="responder-info">
              <p class="responder-name">{{ b.responderName }}</p>
              <p class="tiny">{{ b.responderPhone || 'No phone on file' }}</p>
            </div>
          </div>
          <div class="barangay-actions">
            <button
              type="button"
              class="btn btn--mini btn--mini-ghost"
              @click="openAssign(b)"
            >
              Change
            </button>
            <button
              type="button"
              class="btn btn--mini btn--mini-danger"
              @click="clearAssignment(b)"
            >
              Clear
            </button>
          </div>
        </div>

        <!-- Unassigned -->
        <div v-else class="barangay-body">
          <p class="tiny barangay-warning">
            No responder yet — incidents here can't be dispatched.
          </p>
          <button
            type="button"
            class="btn btn--mini btn--mini-primary"
            @click="openAssign(b)"
          >
            Assign responder
          </button>
        </div>
      </li>
    </ul>

    <!-- ============================================================
         ASSIGN MODAL
         ============================================================ -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showAssignModal"
          class="modal-root"
          @click.self="closeAssign"
        >
          <div class="modal-backdrop" @click="closeAssign" />

          <div class="modal-sheet">
            <div class="modal-grabber" />

            <header class="modal-head">
              <div>
                <h2 class="h2">Assign responder</h2>
                <p class="tiny">
                  For <strong>{{ selectedBarangay?.name }}</strong>
                </p>
              </div>
              <button
                class="modal-close"
                aria-label="Close"
                @click="closeAssign"
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
              <!-- Search -->
              <input
                v-model="responderQuery"
                type="text"
                class="input"
                placeholder="Search by name, phone, or agency…"
              />

              <!-- Loading -->
              <div v-if="loadingResponders" class="modal-state">
                <div class="state-spinner state-spinner--sm" />
                <span class="tiny">Loading responders…</span>
              </div>

              <!-- No responders -->
              <div v-else-if="!responders.length" class="modal-state">
                <p class="tiny modal-state-text">
                  No active responders exist yet. Create one first.
                </p>
              </div>

              <!-- No search results -->
              <div
                v-else-if="!filteredResponders.length"
                class="modal-state"
              >
                <p class="tiny modal-state-text">
                  No responders match "{{ responderQuery }}"
                </p>
              </div>

              <!-- Responder list -->
              <ul v-else class="responder-list">
                <li
                  v-for="r in filteredResponders"
                  :key="r.uid"
                  class="responder-item"
                  :class="{
                    'responder-item--current':
                      r.uid === selectedBarangay?.responderUid,
                  }"
                  @click="assignResponder(r)"
                >
                  <span class="responder-avatar" aria-hidden="true">
                    {{ (r.fullName || '?').charAt(0).toUpperCase() }}
                  </span>
                  <div class="responder-item-body">
                    <p class="responder-item-name">{{ r.fullName }}</p>
                    <p class="tiny">
                      {{ r.phone || 'No phone' }}
                      <template v-if="r.agency"> · {{ r.agency }}</template>
                    </p>
                  </div>
                  <span
                    v-if="r.uid === selectedBarangay?.responderUid"
                    class="responder-item-check"
                    aria-label="Currently assigned"
                  >
                    ✓
                  </span>
                </li>
              </ul>

              <p v-if="actionError" class="error-text action-error">
                {{ actionError }}
              </p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.barangays-tab {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.head {
  margin-bottom: 16px;
}
@media (min-width: 768px) {
  .head .h1 { font-size: 1.75rem; }
  .summary-card { max-width: 600px; margin-inline: auto; }
}
@media (min-width: 1024px) {
  .head .h1 { font-size: 2rem; }
  .head .muted { font-size: 1rem; }
}
.head .h1 {
  font-size: 1.5rem;
}
.head .muted {
  margin-top: 4px;
  line-height: 1.5;
}

/* ---------- Summary card ---------- */
.summary-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 14px;
}
.summary-stat {
  flex: 1;
  text-align: center;
}
.summary-value {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--text);
  line-height: 1;
  margin-bottom: 4px;
}
.summary-value--warn {
  color: #f59e0b;
}
.summary-label {
  line-height: 1.2;
}
.summary-divider {
  width: 1px;
  height: 32px;
  background: var(--border);
}

/* ---------- Filter chips ---------- */
.chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 6px;
  margin-bottom: 10px;
  scrollbar-width: none;
}
.chips::-webkit-scrollbar {
  display: none;
}
.chip {
  flex-shrink: 0;
  min-height: 32px;
  padding: 6px 14px;
  border-radius: 99px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.8125rem;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.chip--on {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

/* ---------- Search ---------- */
.search-wrap {
  position: relative;
  margin-bottom: 14px;
}
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
  transition: border-color 0.15s ease;
}
.search-input:focus {
  border-color: #3b82f6;
}

/* ---------- State blocks ---------- */
.state-block {
  background: var(--bg-elev);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  padding: 40px 24px;
  text-align: center;
}
.state-spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: #3b82f6;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}
.state-spinner--sm {
  width: 16px;
  height: 16px;
  border-width: 2px;
  margin: 0;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.state-icon {
  font-size: 2rem;
  line-height: 1;
  margin-bottom: 10px;
  opacity: 0.8;
}
.state-title {
  font-size: 0.9375rem;
  font-weight: 650;
  margin-bottom: 4px;
}
.state-text {
  line-height: 1.5;
  max-width: 30ch;
  margin-inline: auto;
}

/* ---------- Barangay list ---------- */
.list {
  list-style: none;
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  padding-bottom: 20px;
}

@media (min-width: 768px) {
  .list {
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }
}

@media (min-width: 1024px) {
  .list {
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
}
.barangay-card {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
}
.barangay-card--assigned {
  border-color: rgba(47, 158, 115, 0.3);
  background:
    radial-gradient(
      90% 100% at 50% 0%,
      var(--accent-soft) 0%,
      transparent 70%
    ),
    var(--bg-elev);
}
.barangay-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.barangay-name {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1.3;
}
.barangay-status {
  flex-shrink: 0;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 8px;
  border-radius: 6px;
}
.barangay-status--ok {
  color: var(--accent);
  background: var(--accent-soft);
}
.barangay-status--warn {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.14);
}
.barangay-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.responder-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.responder-icon {
  font-size: 1.125rem;
  flex-shrink: 0;
}
.responder-info {
  flex: 1;
  min-width: 0;
}
.responder-name {
  font-size: 0.875rem;
  font-weight: 650;
  margin-bottom: 2px;
}
.barangay-warning {
  color: #f59e0b;
  line-height: 1.4;
}
.barangay-actions {
  display: flex;
  gap: 8px;
}

/* ---------- Mini buttons ---------- */
.btn--mini {
  min-height: 36px;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 0.8125rem;
  font-weight: 650;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  width: auto;
}
.btn--mini:active {
  transform: scale(0.96);
}
.btn--mini-primary {
  background: #3b82f6;
  color: #fff;
  align-self: flex-start;
}
.btn--mini-ghost {
  background: var(--bg-input);
  color: var(--text);
  border: 1px solid var(--border);
}
.btn--mini-danger {
  background: rgba(239, 68, 68, 0.14);
  color: var(--danger);
}

/* ============================================================
   ASSIGN MODAL
   ============================================================ */
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
  max-height: 88dvh;
  padding-bottom: var(--sab);
  animation: sheet-up 0.24s ease;
}
@keyframes sheet-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
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
  padding: 8px 20px 12px;
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
  padding: 16px 20px 24px;
}
.modal-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 32px 16px;
}
.modal-state-text {
  text-align: center;
  line-height: 1.5;
  max-width: 28ch;
}
.responder-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 14px;
}
.responder-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--bg-input);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}
.responder-item:active {
  transform: scale(0.98);
}
.responder-item--current {
  background: rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.4);
}
.responder-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #3b82f6;
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 0.9375rem;
  flex-shrink: 0;
}
.responder-item-body {
  flex: 1;
  min-width: 0;
}
.responder-item-name {
  font-size: 0.9375rem;
  font-weight: 650;
  margin-bottom: 2px;
}
.responder-item-check {
  color: #3b82f6;
  font-size: 1.25rem;
  font-weight: 700;
  flex-shrink: 0;
}
.action-error {
  margin-top: 12px;
  text-align: center;
}

/* ---------- Fade transition ---------- */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>