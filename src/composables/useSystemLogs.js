// src/composables/useSystemLogs.js
//
// Subscribes to the `system_logs` collection in realtime.

import { ref, onBeforeUnmount } from 'vue'
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore'
import { db } from '@/firebase'

export function useSystemLogs({ autoStart = true, maxRecords = 500 } = {}) {
  const logs = ref([])
  const loading = ref(true)
  const error = ref('')

  let unsubscribe = null

  function start() {
    stop()
    loading.value = true
    error.value = ''

    try {
      const q = query(
        collection(db, 'system_logs'),
        orderBy('timestamp', 'desc'),
        limit(maxRecords)
      )

      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const list = []
          snap.forEach((docSnap) => {
            const data = docSnap.data() || {}
            list.push({
              id: docSnap.id,
              ...data,
              timestamp:
                data.timestamp?.toDate?.() ||
                (data.timestamp ? new Date(data.timestamp) : null),
            })
          })
          logs.value = list
          loading.value = false
        },
        (err) => {
          console.error('[useSystemLogs] snapshot error', err)
          error.value = err.message || 'Could not load logs.'
          loading.value = false
        }
      )
    } catch (e) {
      console.error('[useSystemLogs] build query failed', e)
      error.value = 'Could not start log feed.'
      loading.value = false
    }
  }

  function stop() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  if (autoStart) start()
  onBeforeUnmount(stop)

  return { logs, loading, error, restart: start, stop }
}