<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useIncidents, STATUS_GROUPS } from '@/composables/useIncidents'
import AdminNav from '@/components/AdminNav.vue'

import HistoryTab from './admin/HistoryTab.vue'
import BarangaysTab from './admin/BarangaysTab.vue'
import VerifyTab from './admin/VerifyTab.vue'
import AnalyticsTab from './admin/AnalyticsTab.vue'
import InsightsTab from './admin/InsightsTab.vue'
import UsersTab from './admin/UsersTab.vue'
import AdminProfileTab from './admin/AdminProfileTab.vue'

const auth = useAuthStore()
const activeTab = ref('verify')

const { incidents: unverifiedIncidents } = useIncidents({
  statuses: STATUS_GROUPS.UNVERIFIED,
  scope: 'all',
})

const pendingCount = computed(() => unverifiedIncidents.value.length)
const isAdmin = computed(() => auth.profile?.role === 'admin')
</script>

<template>
  <div class="admin-shell">
    <!-- Access denied banner -->
    <div v-if="!isAdmin" class="access-banner" role="alert">
      <div class="access-icon" aria-hidden="true">🚫</div>
      <div class="access-body">
        <p class="access-title">Admin access required</p>
        <p class="access-text">
          This dashboard is only available to administrators.
        </p>
      </div>
    </div>

    <!-- Nav: top chips (mobile) / sidebar (desktop) -->
    <AdminNav v-model="activeTab" :pending-count="pendingCount" />

    <!-- Main content -->
    <main class="admin-content" :class="`admin-content--${activeTab}`">
      <div class="content-inner">
        <HistoryTab v-if="activeTab === 'history'" />
        <BarangaysTab v-else-if="activeTab === 'barangays'" />
        <AnalyticsTab v-else-if="activeTab === 'analytics'" />
        <VerifyTab v-else-if="activeTab === 'verify'" />
        <InsightsTab v-else-if="activeTab === 'insights'" />
        <UsersTab v-else-if="activeTab === 'users'" />
        <AdminProfileTab v-else-if="activeTab === 'profile'" />
      </div>
    </main>
  </div>
</template>

<style scoped>
.admin-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--bg);
}

/* Access-denied banner */
.access-banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 16px;
  padding-top: calc(env(safe-area-inset-top, 0px) + 12px);
  background: rgba(239, 68, 68, 0.12);
  border-bottom: 1px solid rgba(239, 68, 68, 0.3);
  z-index: 60;
}
.access-icon { font-size: 1.25rem; line-height: 1.2; flex-shrink: 0; }
.access-body { min-width: 0; flex: 1; }
.access-title {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--danger);
  margin-bottom: 2px;
}
.access-text {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.admin-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.content-inner {
  width: 100%;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px
    calc(80px + env(safe-area-inset-bottom, 0px));
}

.content-inner > * { min-width: 0; }

/* Very small phones */
@media (max-width: 380px) {
  .content-inner { padding-left: 12px; padding-right: 12px; }
}

@media (min-width: 640px) {
  .content-inner {
    padding: calc(env(safe-area-inset-top, 0px) + 20px) 24px
      calc(80px + env(safe-area-inset-bottom, 0px));
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .content-inner { max-width: 820px; margin-inline: auto; }
}

/* Desktop — sidebar on the left, bottom bar gone */
@media (min-width: 1024px) {
  .admin-shell { flex-direction: row; }

  .access-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
  }

  .admin-content {
    flex: 1;
    margin-left: 248px;
    min-height: 100dvh;
  }

  .content-inner {
    max-width: 1280px;
    margin-inline: auto;
    padding: 28px 32px 40px;
  }
}

@media (min-width: 1440px) {
  .admin-content { margin-left: 280px; }
  .content-inner { max-width: 1380px; padding: 32px 48px 48px; }
}
</style>