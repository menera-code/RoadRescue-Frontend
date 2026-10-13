<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  setDoc,
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
// NORMALIZER — supports both new (array) and legacy (single) schemas
// =========================================================================
function respondersFromDoc(d) {
  if (Array.isArray(d.responders) && d.responders.length) {
    return d.responders.filter(
      (r) => r && typeof r === 'object' && r.uid
    )
  }
  // Legacy migration: single responder stored on flat fields
  if (d.responderUid) {
    return [
      {
        uid: d.responderUid,
        name: d.responderName || '',
        phone: d.responderPhone || '',
        agency: '',
        assignedAt: d.assignedAt || null,
      },
    ]
  }
  return []
}

// =========================================================================
// STATE — barangays
// =========================================================================
const barangayDocs = ref({})
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
// MERGED VIEW
// =========================================================================
const mergedBarangays = computed(() => {
  return BARANGAY_NAMES.map((name) => {
    const slug = slugify(name)
    const doc = barangayDocs.value[slug] || {}
    return {
      name,
      slug,
      responders: respondersFromDoc(doc),
    }
  })
})

const stats = computed(() => {
  let withResponder = 0
  let totalResponders = 0
  for (const b of mergedBarangays.value) {
    if (b.responders.length) withResponder++
    totalResponders += b.responders.length
  }
  return {
    withResponder,
    unassigned: mergedBarangays.value.length - withResponder,
    total: mergedBarangays.value.length,
    totalResponders,
  }
})

// =========================================================================
// SEARCH + FILTER
// =========================================================================
const searchQuery = ref('')
const filterMode = ref('all') // 'all' | 'unassigned' | 'assigned'

const visibleBarangays = computed(() => {
  let list = mergedBarangays.value

  if (filterMode.value === 'unassigned') {
    list = list.filter((b) => !b.responders.length)
  } else if (filterMode.value === 'assigned') {
    list = list.filter((b) => b.responders.length > 0)
  }

  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.responders.some((r) =>
          (r.name || '').toLowerCase().includes(q)
        )
    )
  }

  return list
})

// =========================================================================
// ADD RESPONDER MODAL
// =========================================================================
const showAddModal = ref(false)
const selectedBarangay = ref(null)
const responderQuery = ref('')
const saving = ref(false)
const actionError = ref('')

// UIDs already in the currently-selected barangay
const alreadyAssignedUids = computed(() => {
  if (!selectedBarangay.value) return new Set()
  return new Set(selectedBarangay.value.responders.map((r) => r.uid))
})

// Filters responders by search query, and marks already-assigned ones
const filteredResponders = computed(() => {
  const q = responderQuery.value.trim().toLowerCase()
  const base = responders.value

  const filtered = !q
    ? base
    : base.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.phone.toLowerCase().includes(q) ||
          r.agency.toLowerCase().includes(q)
      )

  return filtered.map((r) => ({
    ...r,
    alreadyIn: alreadyAssignedUids.value.has(r.uid),
  }))
})

function openAddModal(barangay) {
  selectedBarangay.value = barangay
  responderQuery.value = ''
  actionError.value = ''
  showAddModal.value = true
}

function closeAddModal() {
  showAddModal.value = false
  selectedBarangay.value = null
  responderQuery.value = ''
}

async function addResponder(responder) {
  if (!selectedBarangay.value || saving.value) return
  if (alreadyAssignedUids.value.has(responder.uid)) return

  saving.value = true
  actionError.value = ''

  try {
    const bRef = doc(db, 'barangays', selectedBarangay.value.slug)
    const bSnap = await getDoc(bRef)

    const current = bSnap.exists()
      ? respondersFromDoc(bSnap.data())
      : []

    if (current.some((r) => r.uid === responder.uid)) {
      actionError.value = 'Already assigned to this barangay.'
      return
    }

    const entry = {
      uid: responder.uid,
      name: responder.fullName || '',
      phone: responder.phone || '',
      agency: responder.agency || '',
      assignedAt: new Date().toISOString(),
      assignedBy: auth.user?.uid || null,
    }

    const nextResponders = [...current, entry]

    const payload = {
      responders: nextResponders,
      updatedAt: serverTimestamp(),
      // Clear legacy single-responder fields so they don't shadow the array
      responderUid: null,
      responderName: null,
      responderPhone: null,
      assignedAt: null,
    }

    if (bSnap.exists()) {
      await updateDoc(bRef, payload)
    } else {
      await setDoc(bRef, {
        name: selectedBarangay.value.name,
        slug: selectedBarangay.value.slug,
        ...payload,
      })
    }

    // Update the local view immediately (optimistic)
    selectedBarangay.value = {
      ...selectedBarangay.value,
      responders: nextResponders,
    }
  } catch (e) {
    console.error('[BarangaysTab] add responder failed', e)
    actionError.value = 'Could not assign. Try again.'
  } finally {
    saving.value = false
  }
}

// =========================================================================
// REMOVE RESPONDER
// =========================================================================
async function removeResponder(barangay, responder) {
  if (!confirm(`Remove ${responder.name || responder.uid} from ${barangay.name}?`)) {
    return
  }

  try {
    const bRef = doc(db, 'barangays', barangay.slug)
    const nextResponders = barangay.responders.filter(
      (r) => r.uid !== responder.uid
    )

    await updateDoc(bRef, {
      responders: nextResponders,
      updatedAt: serverTimestamp(),
    })
  } catch (e) {
    console.error('[BarangaysTab] remove responder failed', e)
    alert('Could not remove responder. Try again.')
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
    <header class="head">
      <h1 class="h1">Barangays</h1>
      <p class="muted">
        Assign one or more responders per barangay. Dispatch sends an SMS
        to every responder — first to accept wins.
      </p>
    </header>

    <!-- Summary -->
    <div class="summary-card">
      <div class="summary-stat">
        <p class="summary-value">{{ stats.withResponder }}</p>
        <p class="tiny summary-label">Covered</p>
      </div>
      <div class="summary-divider" />
      <div class="summary-stat">
        <p class="summary-value summary-value--warn">
          {{ stats.unassigned }}
        </p>
        <p class="tiny summary-label">Uncovered</p>
      </div>
      <div class="summary-divider" />
      <div class="summary-stat">
        <p class="summary-value">{{ stats.totalResponders }}</p>
        <p class="tiny summary-label">Responders</p>
      </div>
      <div class="summary-divider" />
      <div class="summary-stat">
        <p class="summary-value">{{ stats.total }}</p>
        <p class="tiny summary-label">Barangays</p>
      </div>
    </div>

    <!-- Filter chips -->
    <div class="chips" role="tablist">
      <button
        v-for="f in [
          { key: 'all', label: 'All' },
          { key: 'unassigned', label: 'Uncovered' },
          { key: 'assigned', label: 'Covered' },
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
      <p class="tiny state-text">Try a different search or filter.</p>
    </div>

    <!-- List -->
    <ul v-else class="list">
      <li
        v-for="b in visibleBarangays"
        :key="b.slug"
        class="barangay-card"
        :class="{ 'barangay-card--assigned': b.responders.length > 0 }"
      >
        <div class="barangay-head">
          <span class="barangay-name">{{ b.name }}</span>
          <span
            class="barangay-status"
            :class="
              b.responders.length
                ? 'barangay-status--ok'
                : 'barangay-status--warn'
            "
          >
            {{
              b.responders.length
                ? `${b.responders.length} assigned`
                : 'Unassigned'
            }}
          </span>
        </div>

        <!-- Responder list -->
        <ul v-if="b.responders.length" class="responder-list">
          <li
            v-for="r in b.responders"
            :key="r.uid"
            class="responder-row"
          >
            <span class="responder-avatar" aria-hidden="true">
              {{ (r.name || '?').charAt(0).toUpperCase() }}
            </span>
            <div class="responder-info">
              <p class="responder-name">{{ r.name || 'Unnamed responder' }}</p>
              <p class="tiny responder-meta">
                {{ r.phone || 'No phone' }}
                <template v-if="r.agency"> · {{ r.agency }}</template>
              </p>
            </div>
            <button
              type="button"
              class="responder-remove"
              :aria-label="`Remove ${r.name}`"
              @click="removeResponder(b, r)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </li>
        </ul>

        <p v-else class="tiny barangay-warning">
          No responder yet — incidents here can't be dispatched.
        </p>

        <button
          type="button"
          class="btn-add"
          :disabled="loadingResponders"
          @click="openAddModal(b)"
        >
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
            />
          </svg>
          {{ b.responders.length ? 'Add another responder' : 'Add responder' }}
        </button>
      </li>
    </ul>

    <!-- ============================================================
         ADD RESPONDER MODAL
         ============================================================ -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showAddModal"
          class="modal-root"
          @click.self="closeAddModal"
        >
          <div class="modal-backdrop" @click="closeAddModal" />

          <div class="modal-sheet">
            <div class="modal-grabber" />

            <header class="modal-head">
              <div>
                <h2 class="h2">Add responder</h2>
                <p class="tiny">
                  To <strong>{{ selectedBarangay?.name }}</strong> ·
                  {{ alreadyAssignedUids.size }} already assigned
                </p>
              </div>
              <button
                class="modal-close"
                aria-label="Close"
                @click="closeAddModal"
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

              <!-- No responders at all -->
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
              <ul v-else class="responder-picker">
                <li
                  v-for="r in filteredResponders"
                  :key="r.uid"
                  class="responder-pick"
                  :class="{ 'responder-pick--done': r.alreadyIn }"
                  @click="!r.alreadyIn && addResponder(r)"
                >
                  <span class="picker-avatar" aria-hidden="true">
                    {{ (r.fullName || '?').charAt(0).toUpperCase() }}
                  </span>
                  <div class="picker-body">
                    <p class="picker-name">{{ r.fullName || 'Unnamed' }}</p>
                    <p class="tiny">
                      {{ r.phone || 'No phone' }}
                      <template v-if="r.agency"> · {{ r.agency }}</template>
                    </p>
                  </div>
                  <span
                    v-if="r.alreadyIn"
                    class="picker-check"
                    aria-label="Already assigned"
                  >
                    ✓
                  </span>
                  <span
                    v-else
                    class="picker-add"
                    aria-hidden="true"
                  >
                    +
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

.head { margin-bottom: 16px; }
.head .h1 { font-size: 1.5rem; }
.head .muted { margin-top: 4px; line-height: 1.5; }

/* Summary */
.summary-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 12px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 14px;
}
.summary-stat { flex: 1; text-align: center; min-width: 0; }
.summary-value {
  font-size: 1.375rem;
  font-weight: 800;
  color: var(--text);
  line-height: 1;
  margin-bottom: 4px;
}
.summary-value--warn { color: #f59e0b; }
.summary-label { line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.summary-divider {
  width: 1px;
  height: 32px;
  background: var(--border);
  flex-shrink: 0;
}

/* Chips */
.chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 6px;
  margin-bottom: 10px;
  scrollbar-width: none;
}
.chips::-webkit-scrollbar { display: none; }
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
  font-family: inherit;
}
.chip--on { background: #3b82f6; border-color: #3b82f6; color: #fff; }

/* Search */
.search-wrap { position: relative; margin-bottom: 14px; }
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
  font-family: inherit;
}
.search-input:focus { border-color: #3b82f6; }

/* State blocks */
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
@keyframes spin { to { transform: rotate(360deg); } }
.state-icon { font-size: 2rem; line-height: 1; margin-bottom: 10px; opacity: 0.8; }
.state-title { font-size: 0.9375rem; font-weight: 650; margin-bottom: 4px; }
.state-text { line-height: 1.5; max-width: 30ch; margin-inline: auto; }

/* List */
.list {
  list-style: none;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  padding-bottom: 20px;
}

.barangay-card {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.barangay-card--assigned {
  border-color: rgba(47, 158, 115, 0.3);
  background:
    radial-gradient(90% 100% at 50% 0%, var(--accent-soft) 0%, transparent 70%),
    var(--bg-elev);
}
.barangay-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
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
  white-space: nowrap;
}
.barangay-status--ok { color: var(--accent); background: var(--accent-soft); }
.barangay-status--warn { color: #f59e0b; background: rgba(245, 158, 11, 0.14); }

.responder-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.responder-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--bg-input);
  border-radius: 10px;
}
.responder-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(160deg, #3cb886 0%, #2f9e73 55%, #267a58 100%);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 0.8125rem;
  flex-shrink: 0;
}
.responder-info { flex: 1; min-width: 0; }
.responder-name {
  font-size: 0.8125rem;
  font-weight: 650;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.responder-meta { line-height: 1.3; }
.responder-remove {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.14);
  border: none;
  color: var(--danger);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.responder-remove:active { transform: scale(0.9); }

.barangay-warning { color: #f59e0b; line-height: 1.4; }

.btn-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 10px;
  background: #3b82f6;
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 650;
  border: none;
  cursor: pointer;
  align-self: stretch;
  font-family: inherit;
  transition: all 0.15s ease;
}
.btn-add:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-add:active:not(:disabled) { transform: scale(0.97); }

/* Modal */
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
.responder-picker {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 14px;
}
.responder-pick {
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
.responder-pick:active:not(.responder-pick--done) { transform: scale(0.98); }
.responder-pick--done {
  opacity: 0.55;
  cursor: default;
}
.picker-avatar {
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
.picker-body { flex: 1; min-width: 0; }
.picker-name {
  font-size: 0.9375rem;
  font-weight: 650;
  margin-bottom: 2px;
}
.picker-check {
  color: var(--accent);
  font-size: 1.25rem;
  font-weight: 700;
  flex-shrink: 0;
}
.picker-add {
  color: #3b82f6;
  font-size: 1.5rem;
  font-weight: 700;
  flex-shrink: 0;
  line-height: 1;
}

.action-error { margin-top: 12px; text-align: center; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* Responsive */
@media (min-width: 640px) {
  .head .h1 { font-size: 1.75rem; }
  .list { grid-template-columns: repeat(2, 1fr); gap: 14px; }

  .modal-root { justify-content: center; align-items: center; padding: 24px; }
  .modal-sheet {
    border-radius: 20px;
    border-bottom: 1px solid var(--border);
    width: 100%;
    max-width: 520px;
    max-height: 82dvh;
    animation: dialog-in 0.2s ease;
  }
  @keyframes dialog-in {
    from { transform: scale(0.95); opacity: 0; }
    to   { transform: scale(1);    opacity: 1; }
  }
  .modal-grabber { display: none; }
  .modal-head { padding: 20px 24px 16px; }
  .modal-body { padding: 20px 24px 24px; }
}

@media (min-width: 1024px) {
  .head .h1 { font-size: 2rem; }
  .head .muted { font-size: 1rem; }
  .list { grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .summary-card { max-width: 720px; }
}

@media (min-width: 1440px) {
  .list { grid-template-columns: repeat(4, 1fr); gap: 18px; }
}
</style>