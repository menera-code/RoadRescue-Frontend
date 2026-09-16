<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/auth'
import {
  useIncidents,
  STATUS_GROUPS,
  acknowledgeIncident,
} from '@/composables/useIncidents'
import ResponderNav from '@/components/ResponderNav.vue'

import ResponderMapTab from './responder/ResponderMapTab.vue'
import FeedTab from './responder/FeedTab.vue'
import ResponderProfileTab from './responder/ResponderProfileTab.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const activeTab = ref('feed')

const { incidents: pendingIncidents } = useIncidents({
  statuses: STATUS_GROUPS.OPEN,
  scope: 'all',
})

const pendingCount = computed(() => pendingIncidents.value.length)
const isVerified = computed(() => auth.profile?.status === 'active')

// ---------------------------------------------------------------------------
// DEEP LINK — acknowledgment from SMS
// ---------------------------------------------------------------------------
const ackNotice = ref('')
const ackTone = ref('success') // 'success' | 'error' | 'info'

onMounted(async () => {
  const ref6 = route.query.ack

  if (!ref6 || typeof ref6 !== 'string') return

  // Session should already be restored by the router guard, but double-check
  if (!auth.user) {
    // Save intent, redirect to login
    router.replace({
      name: 'login',
      query: { redirect: `/dashboard?ack=${ref6}` },
    })
    return
  }

  await handleAck(ref6)
})

async function handleAck(ref6) {
  const ref = ref6.toUpperCase()

  try {
    // Find the incident whose ID starts with the ref
    const incidentId = await findIncidentIdByRef(ref)

    if (!incidentId) {
      ackTone.value = 'error'
      ackNotice.value = `No incident found for Ref ${ref}.`
      return
    }

    const result = await acknowledgeIncident(incidentId, 'deeplink')

    if (result.alreadyAcknowledged) {
      ackTone.value = 'info'
      ackNotice.value = `Ref ${ref} was already acknowledged.`
    } else {
      ackTone.value = 'success'
      ackNotice.value = `✅ Acknowledged in ${result.responseTimeSeconds}s. Thank you.`
    }
  } catch (e) {
    console.error('[ResponderDashboard] ack failed', e)
    ackTone.value = 'error'
    ackNotice.value = 'Could not acknowledge. Try opening the incident manually.'
  } finally {
    // Clean URL so a page refresh doesn't re-trigger
    router.replace({ path: '/dashboard' })

    // Auto-dismiss the notice
    setTimeout(() => (ackNotice.value = ''), 6000)
  }
}

/**
 * Find an incident ID by its 6-char short ref.
 * Only considers incidents assigned to the current responder.
 */
async function findIncidentIdByRef(ref6) {
  if (!auth.user?.uid) return null

  // Query incidents assigned to this responder
  const q = query(
    collection(db, 'incidents'),
    where('assignedResponderUid', '==', auth.user.uid)
  )
  const snap = await getDocs(q)

  for (const docSnap of snap.docs) {
    if (docSnap.id.slice(0, 6).toUpperCase() === ref6) {
      return docSnap.id
    }
  }
  return null
}
</script>

<template>
  <div class="responder-shell">
    <!-- Deep-link acknowledgment banner -->
    <Transition name="fade">
      <div
        v-if="ackNotice"
        class="ack-banner"
        :class="`ack-banner--${ackTone}`"
      >
        <span class="ack-icon" aria-hidden="true">
          {{ ackTone === 'success' ? '✅' : ackTone === 'error' ? '⚠️' : 'ℹ️' }}
        </span>
        <p class="ack-text">{{ ackNotice }}</p>
      </div>
    </Transition>

    <!-- Verification banner -->
    <div v-if="!isVerified" class="verify-banner">
      <div class="verify-icon" aria-hidden="true">⏳</div>
      <div class="verify-body">
        <p class="verify-title">Verification pending</p>
        <p class="verify-text">
          An administrator is reviewing your account.
        </p>
      </div>
    </div>

    <main class="tab-stage" :class="`tab-stage--${activeTab}`">
      <KeepAlive>
        <ResponderMapTab v-if="activeTab === 'map'" />
        <FeedTab v-else-if="activeTab === 'feed'" />
        <ResponderProfileTab v-else-if="activeTab === 'profile'" />
      </KeepAlive>
    </main>

    <ResponderNav v-model="activeTab" :pending-count="pendingCount" />
  </div>
</template>

<style scoped>
.responder-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--bg);
}

/* ---------- Ack banner ---------- */
.ack-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid transparent;
  padding-top: calc(env(safe-area-inset-top, 0px) + 12px);
  animation: slide-down 0.3s ease;
}
@keyframes slide-down {
  from { transform: translateY(-100%); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}

.ack-banner--success {
  background: var(--accent-soft);
  border-bottom-color: rgba(47, 158, 115, 0.35);
}
.ack-banner--success .ack-text {
  color: var(--accent);
}

.ack-banner--info {
  background: rgba(59, 130, 246, 0.12);
  border-bottom-color: rgba(59, 130, 246, 0.35);
}
.ack-banner--info .ack-text {
  color: #3b82f6;
}

.ack-banner--error {
  background: rgba(239, 68, 68, 0.12);
  border-bottom-color: rgba(239, 68, 68, 0.35);
}
.ack-banner--error .ack-text {
  color: #ef4444;
}

.ack-icon {
  font-size: 1.125rem;
  flex-shrink: 0;
}
.ack-text {
  font-size: 0.875rem;
  font-weight: 650;
  line-height: 1.4;
}

/* ---------- Verify banner ---------- */
.verify-banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 16px;
  background: rgba(245, 158, 11, 0.12);
  border-bottom: 1px solid rgba(245, 158, 11, 0.3);
  padding-top: calc(env(safe-area-inset-top, 0px) + 12px);
}
.verify-icon { font-size: 1.25rem; line-height: 1.2; flex-shrink: 0; }
.verify-body { min-width: 0; flex: 1; }
.verify-title {
  font-size: 0.875rem;
  font-weight: 700;
  color: #f59e0b;
  margin-bottom: 2px;
}
.verify-text {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.tab-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
}
.tab-stage--map { padding-bottom: 0; }
.tab-stage:not(.tab-stage--map) {
  padding-top: calc(env(safe-area-inset-top, 0px) + 16px);
  padding-left: calc(20px + env(safe-area-inset-left, 0px));
  padding-right: calc(20px + env(safe-area-inset-right, 0px));
}
.tab-stage:not(.tab-stage--map):first-child { padding-top: 16px; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>