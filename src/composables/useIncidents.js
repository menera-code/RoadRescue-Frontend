// src/composables/useIncidents.js
//
// Real-time Firestore subscriptions for the `incidents` collection.

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

export const INCIDENT_STATUS = Object.freeze({
  UNVERIFIED: 'unverified',
  PENDING:    'pending',
  ACCEPTED:   'accepted',
  EN_ROUTE:   'en_route',
  ON_SCENE:   'on_scene',
  RESOLVED:   'resolved',
  CANCELLED:  'cancelled',
})

export const STATUS_GROUPS = Object.freeze({
  UNVERIFIED: ['unverified'],
  OPEN:       ['pending'],
  ACTIVE:     ['accepted', 'en_route', 'on_scene'],
  DONE:       ['resolved', 'cancelled'],
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

export function useIncidents(options = {}) {
  const auth = useAuthStore()
  const { statuses = null, scope = 'all', autoStart = true } = options

  const incidents = ref([])
  const loading = ref(true)
  const error = ref('')

  let unsubscribe = null

  function buildQuery() {
    const constraints = []

    if (statuses && statuses.length) {
      constraints.push(where('status', 'in', statuses))
    }

    const uid = auth.user?.uid
    if (scope === 'assignedToMe' && uid) {
      constraints.push(where('responderUid', '==', uid))
    } else if (scope === 'createdByMe' && uid) {
      constraints.push(where('citizenUid', '==', uid))
    }

    constraints.push(orderBy('createdAt', 'desc'))

    return query(collection(db, 'incidents'), ...constraints)
  }

  function start() {
    stop()
    loading.value = true
    error.value = ''

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
              createdAt: data.createdAt?.toDate?.() || data.createdAt || null,
              updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || null,
              acceptedAt: data.acceptedAt?.toDate?.() || data.acceptedAt || null,
              resolvedAt: data.resolvedAt?.toDate?.() || data.resolvedAt || null,
              acknowledgedAt: data.acknowledgedAt?.toDate?.() || data.acknowledgedAt || null,
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

  return { incidents, loading, error, stop, restart }
}

/**
 * Accept a pending incident.
 * Atomically sets the responder's uid + flips status to `accepted`.
 * Also sets acknowledgedAt so analytics counts it as acknowledged.
 */
export async function acceptIncident(incidentId, responder) {
  if (!incidentId) throw new Error('incidentId is required')
  if (!responder?.uid) throw new Error('responder.uid is required')

  const ref = doc(db, 'incidents', incidentId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Incident not found')
  const data = snap.data()

  // Idempotent — don't overwrite an existing ack
  if (data.acknowledgedAt) {
    await updateDoc(ref, {
      status: INCIDENT_STATUS.ACCEPTED,
      responderUid: responder.uid,
      responderName: responder.fullName || '',
      acceptedAt: data.acceptedAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return
  }

  const dispatchedAt =
    data.dispatchedAt?.toDate?.() ||
    data.smsSentAt?.toDate?.() ||
    data.verifiedAt?.toDate?.() ||
    data.updatedAt?.toDate?.()

  const responseTimeSeconds = dispatchedAt
    ? Math.max(0, Math.round((Date.now() - dispatchedAt.getTime()) / 1000))
    : null

  await updateDoc(ref, {
    status: INCIDENT_STATUS.ACCEPTED,
    responderUid: responder.uid,
    responderName: responder.fullName || '',

    // Acknowledge
    acknowledgedAt: serverTimestamp(),
    acknowledgedVia: 'app',
    acknowledgedBy: responder.uid,
    responseTimeSeconds,

    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Mark an incident as resolved ("responded").
 * Called by the responder when they finish the job at the scene.
 *
 * Writes:
 *   - status: 'resolved'
 *   - resolvedAt
 *   - resolvedBy
 *   - respondedDurationSeconds (time from accept → resolve)
 *
 * Also pings the backend so analytics cache is invalidated immediately.
 */
export async function resolveIncident(incidentId, responder) {
  if (!incidentId) throw new Error('incidentId is required')

  const ref = doc(db, 'incidents', incidentId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Incident not found')
  const data = snap.data()

  if (data.status === INCIDENT_STATUS.RESOLVED) {
    return { already: true, duration_seconds: data.respondedDurationSeconds ?? null }
  }

  const now = Date.now()
  const acceptedAt =
    data.acceptedAt?.toDate?.() || data.acceptedAt

  const respondedDurationSeconds = acceptedAt
    ? Math.max(0, Math.round((now - new Date(acceptedAt).getTime()) / 1000))
    : null

  await updateDoc(ref, {
    status: INCIDENT_STATUS.RESOLVED,
    resolvedAt: serverTimestamp(),
    resolvedBy: responder?.uid || null,
    respondedDurationSeconds,
    updatedAt: serverTimestamp(),
  })

  // Best-effort: clear the backend analytics cache so the admin dashboard
  // reflects the resolution within seconds.
  try {
    const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
    await fetch(`${API_URL}/resolve-incident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incident_id: incidentId,
        responder_uid: responder?.uid || null,
      }),
    })
  } catch (_) {
    // Non-fatal — the Firestore write already succeeded.
  }

  return {
    already: false,
    duration_seconds: respondedDurationSeconds,
  }
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

export function statusLabel(status) {
  const map = {
    unverified: 'Unverified',
    pending:    'Pending',
    accepted:   'Accepted',
    en_route:   'En route',
    on_scene:   'On scene',
    resolved:   'Resolved',
    cancelled:  'Cancelled',
  }
  return map[status] || status
}

export function statusTone(status) {
  if (status === 'unverified') return 'pending'
  if (status === 'pending') return 'pending'
  if (['accepted', 'en_route', 'on_scene'].includes(status)) return 'active'
  if (status === 'resolved') return 'resolved'
  if (status === 'cancelled') return 'cancelled'
  return 'muted'
}

/**
 * Record an acknowledgment on an incident.
 */
export async function acknowledgeIncident(incidentId, method = 'deeplink') {
  if (!incidentId) throw new Error('incidentId is required')

  const ref = doc(db, 'incidents', incidentId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Incident not found')

  const data = snap.data()

  if (data.acknowledgedAt) {
    return {
      alreadyAcknowledged: true,
      responseTimeSeconds: data.responseTimeSeconds ?? null,
    }
  }

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

  return { alreadyAcknowledged: false, responseTimeSeconds }
}
