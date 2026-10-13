// src/composables/useLogEvent.js
//
// Client-side log writer. Use for user actions (login, logout, form submits).
// Backend-only events (dispatch, SMS) are logged server-side.

import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'

export function useLogEvent() {
  const auth = useAuthStore()

  async function log({
    level = 'info',
    category = 'ui',
    action,
    message,
    target = null,
    metadata = null,
  }) {
    try {
      const actor = auth.user
        ? {
            uid: auth.user.uid,
            email: auth.user.email || null,
            name: auth.profile?.fullName || null,
            role: auth.profile?.role || null,
          }
        : null

      await addDoc(collection(db, 'system_logs'), {
        timestamp: serverTimestamp(),
        level,
        category,
        action,
        message: (message || '').slice(0, 500),
        actor,
        target,
        metadata: metadata || {},
        userAgent: navigator.userAgent.slice(0, 250),
      })
    } catch (e) {
      console.warn('[useLogEvent] write failed', e)
    }
  }

  return { log }
}