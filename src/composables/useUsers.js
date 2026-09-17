// src/composables/useUsers.js
import { ref, onBeforeUnmount } from 'vue'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore'
import { db } from '@/firebase'

export function useUsers({ autoStart = true } = {}) {
  const users = ref([])
  const loading = ref(true)
  const error = ref('')

  let unsubscribe = null

  function start() {
    stop()
    loading.value = true
    error.value = ''

    try {
      const q = query(
        collection(db, 'users'),
        orderBy('createdAt', 'desc')
      )

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list = []
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() || {}
            list.push({
              uid: docSnap.id,
              ...data,
              lastSeen: data.lastSeen?.toDate?.() || null,
              createdAt: data.createdAt?.toDate?.() || null,
            })
          })
          users.value = list
          loading.value = false
        },
        (err) => {
          console.error('[useUsers] snapshot error', err)
          error.value = 'Could not load users.'
          loading.value = false
        }
      )
    } catch (e) {
      console.error('[useUsers] build query failed', e)
      error.value = 'Could not start user feed.'
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

  return { users, loading, error, stop, restart: start }
}