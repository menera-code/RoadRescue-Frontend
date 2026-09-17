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
    <div v-if="!isAdmin" class="access-banner">
      <div class="access-icon" aria-hidden="true">🚫</div>
      <div class="access-body">
        <p class="access-title">Admin access required</p>
        <p class="access-text">This dashboard is only available to administrators.</p>
      </div>
    </div>

    <AdminNav v-model="activeTab" :pending-count="pendingCount" />

    <main class="tab-stage">
      <HistoryTab v-if="activeTab === 'history'" />
      <BarangaysTab v-else-if="activeTab === 'barangays'" />
      <AnalyticsTab v-else-if="activeTab === 'analytics'" />
      <VerifyTab v-else-if="activeTab === 'verify'" />
      <InsightsTab v-else-if="activeTab === 'insights'" />
      <UsersTab v-else-if="activeTab === 'users'" />
      <AdminProfileTab v-else-if="activeTab === 'profile'" />
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

.access-banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.12);
  border-bottom: 1px solid rgba(239, 68, 68, 0.3);
  padding-top: calc(env(safe-area-inset-top, 0px) + 12px);
  z-index: 10;
}
.access-icon { font-size: 1.25rem; line-height: 1.2; flex-shrink: 0; }
.access-body { min-width: 0; flex: 1; }
.access-title { font-size: 0.875rem; font-weight: 700; color: var(--danger); margin-bottom: 2px; }
.access-text { font-size: 0.75rem; color: var(--text-muted); line-height: 1.5; }

.tab-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  margin-inline: auto;
  padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  padding-top: calc(env(safe-area-inset-top, 0px) + 16px);
  padding-left: calc(20px + env(safe-area-inset-left, 0px));
  padding-right: calc(20px + env(safe-area-inset-right, 0px));
}

.tab-stage > * {
  flex: 1;
  min-width: 0;
}

@media (min-width: 768px) {
  .tab-stage {
    max-width: 1000px;
    padding-bottom: 40px;
    padding-top: 28px;
    padding-left: 32px;
    padding-right: 32px;
  }
}

@media (min-width: 1024px) {
  .tab-stage {
    max-width: 1200px;
    padding-top: 32px;
    padding-left: 40px;
    padding-right: 40px;
  }
}

@media (min-width: 1440px) {
  .tab-stage {
    max-width: 1360px;
  }
}
</style>