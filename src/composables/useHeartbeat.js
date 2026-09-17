// src/composables/useHeartbeat.js
//
// Updates users/{uid}.lastSeen on app load + every 5 minutes.

import { onMounted, onBeforeUnmount } from 'vue'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'

const HEARTBEAT_MS = 5 * 60 * 1000 // 5 minutes

export function useHeartbeat() {
  const auth = useAuthStore()
  let timer = null

  async function ping() {
    const uid = auth.user?.uid
    if (!uid) return
    try {
      await updateDoc(doc(db, 'users', uid), {
        lastSeen: serverTimestamp(),
      })
    } catch (e) {
      console.warn('[heartbeat] ping failed', e)
    }
  }

  onMounted(() => {
    ping()
    timer = setInterval(ping, HEARTBEAT_MS)
  })

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
  })

  return { ping }
}