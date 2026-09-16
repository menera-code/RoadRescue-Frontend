<script setup>
import { ref } from 'vue'
import BottomNav from '@/components/BottomNav.vue'

import HomeTab from './citizen/HomeTab.vue'
import HistoryTab from './citizen/HistoryTab.vue'
import MapTab from './citizen/MapTab.vue'
import ReportTab from './citizen/ReportTab.vue'
import LegalTab from './citizen/LegalTab.vue'
import ProfileTab from './citizen/ProfileTab.vue'

// Which tab is currently visible — map is the default
const activeTab = ref('map')

// Profile opens as a full-screen sheet (triggered from HomeTab avatar)
const showProfile = ref(false)
</script>

<template>
  <div class="citizen-shell">
    <!-- Main scrollable tab area -->
    <main class="tab-stage" :class="`tab-stage--${activeTab}`">
      <KeepAlive>
        <HomeTab
          v-if="activeTab === 'home'"
          @open-profile="showProfile = true"
        />
        <HistoryTab v-else-if="activeTab === 'history'" />
        <MapTab v-else-if="activeTab === 'map'" />
        <ReportTab
  v-else-if="activeTab === 'report'"
  @go-to-map="activeTab = 'map'"
/>
        <LegalTab v-else-if="activeTab === 'legal'" />
      </KeepAlive>
    </main>

    <!-- Bottom navigation -->
    <BottomNav v-model="activeTab" />

    <!-- Profile sheet — full-screen overlay -->
    <Transition name="sheet">
      <div v-if="showProfile" class="profile-sheet">
        <header class="profile-sheet__head">
          <h2 class="profile-sheet__title">Profile</h2>
          <button
            class="profile-sheet__close"
            aria-label="Close profile"
            @click="showProfile = false"
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
        <div class="profile-sheet__body">
          <ProfileTab />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.citizen-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--bg);
}

/* ---------- Tab stage ---------- */
.tab-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 520px;
  margin-inline: auto;
  padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
}

.tab-stage--map {
  padding-bottom: 0;
}

.tab-stage:not(.tab-stage--map) {
  padding-top: calc(env(safe-area-inset-top, 0px) + 16px);
  padding-left: calc(20px + env(safe-area-inset-left, 0px));
  padding-right: calc(20px + env(safe-area-inset-right, 0px));
}

/* ---------- Profile sheet ---------- */
.profile-sheet {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  animation: slide-up 0.24s ease;
}

@keyframes slide-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

.profile-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: calc(env(safe-area-inset-top, 0px) + 12px);
  padding-bottom: 12px;
  padding-left: calc(20px + env(safe-area-inset-left, 0px));
  padding-right: calc(20px + env(safe-area-inset-right, 0px));
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

.profile-sheet__title {
  font-size: 1.125rem;
  font-weight: 700;
}

.profile-sheet__close {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  color: var(--text-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.profile-sheet__close:active {
  transform: scale(0.92);
}

.profile-sheet__body {
  flex: 1;
  overflow-y: auto;
  padding-top: calc(env(safe-area-inset-top, 0px) + 4px);
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
  padding-left: calc(20px + env(safe-area-inset-left, 0px));
  padding-right: calc(20px + env(safe-area-inset-right, 0px));
  max-width: 520px;
  width: 100%;
  margin-inline: auto;
}

/* Sheet transition */
.sheet-enter-active,
.sheet-leave-active {
  transition: transform 0.24s ease, opacity 0.24s ease;
}

.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>