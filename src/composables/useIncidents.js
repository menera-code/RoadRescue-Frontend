// src/composables/useIncidents.js
//
// Real-time Firestore subscriptions for the `incidents` collection.
//
// Usage examples:
//
//   const { incidents, loading, error, stop } = useIncidents({
//     statuses: ['pending'],
//     scope: 'all',       // 'all' | 'mine' | 'assignedToMe' | 'createdByMe'
//   })
//
//   const { incidents } = useIncidents({
//     statuses: ['accepted', 'en_route', 'on_scene'],
//     scope: 'assignedToMe',
//   })
//
// The composable automatically unsubscribes when the component unmounts.

import { ref, onBeforeUnmount } from 'vue'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'

/**
 * Incident lifecycle statuses.
 * Use these constants everywhere — never hard-code the strings.
 */
export const INCIDENT_STATUS = Object.freeze({
  UNVERIFIED: 'unverified',  // ← NEW: awaiting admin approval
  PENDING:    'pending',      // ← verified by admin, waiting for responder
  ACCEPTED:   'accepted',
  EN_ROUTE:   'en_route',
  ON_SCENE:   'on_scene',
  RESOLVED:   'resolved',
  CANCELLED:  'cancelled',
})

/**
 * Groups of statuses by lifecycle phase.
 */
export const STATUS_GROUPS = Object.freeze({
  // Admin queue — incidents waiting for verification
  UNVERIFIED: ['unverified'],

  // Responder queue — verified incidents waiting for someone to accept
  OPEN: ['pending'],

  // In progress — a responder has accepted and is working the incident
  ACTIVE: ['accepted', 'en_route', 'on_scene'],

  // Closed — resolved or cancelled
  DONE: ['resolved', 'cancelled'],

  // Everything
  ALL: [
    'unverified',
    'pending',
    'accepted',
    'en_route',
    'on_scene',
    'resolved',
    'cancelled',
  ],
})

/**
 * @param {Object} options
 * @param {string[]} [options.statuses]      - Filter by these statuses (default: all)
 * @param {'all'|'mine'|'assignedToMe'|'createdByMe'} [options.scope='all']
 * @param {boolean} [options.autoStart=true] - Subscribe immediately
 */
export function useIncidents(options = {}) {
  const auth = useAuthStore()

  const {
    statuses = null,
    scope = 'all',
    autoStart = true,
  } = options

  // ---------- State ----------
  const incidents = ref([])
  const loading = ref(true)
  const error = ref('')

  let unsubscribe = null

  // ---------- Query builder ----------
  function buildQuery() {
    const constraints = []

    // Status filter
    if (statuses && statuses.length) {
      constraints.push(where('status', 'in', statuses))
    }

    // Scope filter
    const uid = auth.user?.uid
    if (scope === 'assignedToMe' && uid) {
      constraints.push(where('responderUid', '==', uid))
    } else if (scope === 'createdByMe' && uid) {
      constraints.push(where('citizenUid', '==', uid))
    }

    // Order by newest first
    constraints.push(orderBy('createdAt', 'desc'))

    return query(collection(db, 'incidents'), ...constraints)
  }

  // ---------- Subscribe ----------
  function start() {
    stop()
    loading.value = true
    error.value = ''

    // Guard: scope requires auth but no user yet
    if (
      (scope === 'assignedToMe' || scope === 'createdByMe') &&
      !auth.user?.uid
    ) {
      loading.value = false
      error.value = 'Not signed in.'
      return
    }

    try {
      const q = buildQuery()

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list = []
          snapshot.forEach((docSnap) => {
            const data = docSnap.data()
            list.push({
              id: docSnap.id,
              ...data,
              // Normalize timestamps to JS Dates
              createdAt: data.createdAt?.toDate?.() || data.createdAt || null,
              updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || null,
              acceptedAt: data.acceptedAt?.toDate?.() || data.acceptedAt || null,
              resolvedAt: data.resolvedAt?.toDate?.() || data.resolvedAt || null,
            })
          })
          incidents.value = list
          loading.value = false
        },
        (err) => {
          console.error('[useIncidents] snapshot error', err)
          error.value = 'Could not load incidents.'
          loading.value = false
        }
      )
    } catch (e) {
      console.error('[useIncidents] failed to build query', e)
      error.value = 'Could not start incident feed.'
      loading.value = false
    }
  }

  function stop() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  function restart() {
    stop()
    start()
  }

  if (autoStart) start()
  onBeforeUnmount(stop)

  return {
    incidents,
    loading,
    error,
    stop,
    restart,
  }
}

/**
 * Accept a pending incident.
 * Atomically sets the responder's uid + flips status to `accepted`.
 */
export async function acceptIncident(incidentId, responder) {
  if (!incidentId) throw new Error('incidentId is required')
  if (!responder?.uid) throw new Error('responder.uid is required')

  const ref = doc(db, 'incidents', incidentId)

  await updateDoc(ref, {
    status: INCIDENT_STATUS.ACCEPTED,
    responderUid: responder.uid,
    responderName: responder.fullName || '',
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Update the status of an incident the current responder owns.
 */
export async function updateIncidentStatus(incidentId, newStatus) {
  if (!incidentId) throw new Error('incidentId is required')

  const ref = doc(db, 'incidents', incidentId)
  await updateDoc(ref, {
    status: newStatus,
    updatedAt: serverTimestamp(),
    ...(newStatus === INCIDENT_STATUS.RESOLVED
      ? { resolvedAt: serverTimestamp() }
      : {}),
  })
}

/**
 * Human-readable label for a status.
 */
export function statusLabel(status) {
  const map = {
    pending:   'Pending',
    accepted:  'Accepted',
    en_route:  'En route',
    on_scene:  'On scene',
    resolved:  'Resolved',
    cancelled: 'Cancelled',
  }
  return map[status] || status
}

export function statusTone(status) {
  if (status === 'pending') return 'pending'
  if (['accepted', 'en_route', 'on_scene'].includes(status)) return 'active'
  if (status === 'resolved') return 'resolved'
  if (status === 'cancelled') return 'cancelled'
  return 'muted'
}

/**
 * Record an acknowledgment on an incident.
 *
 * Called when the responder opens the deep link from the SMS,
 * or when they tap an "Acknowledge" button in the app.
 *
 * @param {string} incidentId - Full Firestore document ID
 * @param {'deeplink'|'app'|'manual'} method - How it was acknowledged
 * @returns {{ alreadyAcknowledged: boolean, responseTimeSeconds: number|null }}
 */
export async function acknowledgeIncident(incidentId, method = 'deeplink') {
  if (!incidentId) throw new Error('incidentId is required')

  const ref = doc(db, 'incidents', incidentId)
  const snap = await getDoc(ref)

  if (!snap.exists()) {
    throw new Error('Incident not found')
  }

  const data = snap.data()

  // Idempotent — if already acknowledged, return early
  if (data.acknowledgedAt) {
    return {
      alreadyAcknowledged: true,
      responseTimeSeconds: data.responseTimeSeconds ?? null,
    }
  }

  // Compute QRT client-side (within ~1s of server time)
  const dispatchedAt =
    data.smsSentAt?.toDate?.() ||
    data.verifiedAt?.toDate?.() ||
    data.updatedAt?.toDate?.()

  const now = new Date()
  const responseTimeSeconds = dispatchedAt
    ? Math.max(0, Math.round((now - dispatchedAt) / 1000))
    : null

  await updateDoc(ref, {
    acknowledgedAt: serverTimestamp(),
    acknowledgedVia: method,
    responseTimeSeconds,
    updatedAt: serverTimestamp(),
  })

  return {
    alreadyAcknowledged: false,
    responseTimeSeconds,
  }
}