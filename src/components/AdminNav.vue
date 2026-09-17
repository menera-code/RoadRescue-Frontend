<script setup>
const props = defineProps({
  modelValue: { type: String, required: true },
  pendingCount: { type: Number, default: 0 },
})
const emit = defineEmits(['update:modelValue'])

const TABS = [
  {
    key: 'verify',
    label: 'Verify',
    badge: 'pending',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/></svg>`,
  },
  {
    key: 'history',
    label: 'History',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 8v4l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/></svg>`,
  },
  {
    key: 'barangays',
    label: 'Barangays',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-6.5-7-11.5a7 7 0 1114 0C19 14.5 12 21 12 21z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.5" stroke="currentColor" stroke-width="2"/></svg>`,
  },
  {
    key: 'analytics',
    label: 'Analytics',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  },
  {
    key: 'insights',
    label: 'Insights',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.2 1 2.1V17h6v-.2c0-.9.4-1.6 1-2.1A7 7 0 0012 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    key: 'users',
    label: 'Users',
    icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3.5" stroke="currentColor" stroke-width="2"/><path d="M2.5 20c0-3.3 3-6 6.5-6s6.5 2.7 6.5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 4.5a3.5 3.5 0 010 7M22 20c0-2.8-2.3-5-5-5.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  },
  {
    key: 'profile',
    label: 'Profile',
    icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="9" r="3.5" stroke="currentColor" stroke-width="2"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  },
]

function select(key) {
  emit('update:modelValue', key)
}
</script>

<template>
  <nav class="admin-nav" aria-label="Admin navigation">
    <!-- Brand (desktop only) -->
    <div class="nav-brand">
      <span class="brand-mark" aria-hidden="true">⚡</span>
      <div class="brand-text">
        <p class="brand-title">RoadRescue</p>
        <p class="brand-sub">Admin Console</p>
      </div>
    </div>

    <div class="nav-scroll">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        class="nav-tab"
        :class="{ 'nav-tab--on': modelValue === tab.key }"
        :aria-current="modelValue === tab.key ? 'page' : undefined"
        @click="select(tab.key)"
      >
        <span class="nav-icon" aria-hidden="true" v-html="tab.icon" />
        <span class="nav-label">{{ tab.label }}</span>
        <span
          v-if="tab.badge === 'pending' && pendingCount > 0"
          class="nav-badge"
          :aria-label="`${pendingCount} pending`"
        >
          {{ pendingCount > 99 ? '99+' : pendingCount }}
        </span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
/* ============================================================
   MOBILE-FIRST — sticky top bar with horizontal scroll
   ============================================================ */
.admin-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding-top: env(safe-area-inset-top, 0px);
}

.nav-brand { display: none; }

.nav-scroll {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.nav-scroll::-webkit-scrollbar { display: none; }

.nav-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 8px 14px;
  min-height: 40px;
  border-radius: 99px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  font-size: 0.8125rem;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  font-family: inherit;
}

.nav-tab:active { transform: scale(0.96); }

.nav-tab--on {
  background: var(--bg-elev);
  border-color: var(--border);
  color: var(--text);
}

.nav-icon {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.nav-icon :deep(svg) { width: 100%; height: 100%; }

.nav-label { line-height: 1; }

.nav-badge {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--danger);
  color: #fff;
  font-size: 0.625rem;
  font-weight: 700;
  line-height: 1;
}

/* Small phones — tighten padding */
@media (max-width: 380px) {
  .nav-scroll { padding: 6px 8px; gap: 3px; }
  .nav-tab { padding: 7px 11px; font-size: 0.75rem; }
  .nav-label { display: none; }
  .nav-icon { width: 20px; height: 20px; }
}

/* ============================================================
   DESKTOP — fixed left sidebar with brand
   ============================================================ */
@media (min-width: 1024px) {
  .admin-nav {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 248px;
    border-bottom: none;
    border-right: 1px solid var(--border);
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .nav-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 22px 20px 20px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .brand-mark {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    background: linear-gradient(160deg, #4f8ff7 0%, #3b82f6 55%, #2563eb 100%);
    color: #fff;
    font-size: 1.125rem;
    flex-shrink: 0;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
  }

  .brand-text { min-width: 0; }
  .brand-title {
    font-size: 0.9375rem;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.01em;
    line-height: 1.2;
  }
  .brand-sub {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-top: 2px;
  }

  .nav-scroll {
    flex-direction: column;
    gap: 2px;
    padding: 16px 12px;
    overflow: visible;
    flex: 1;
  }

  .nav-tab {
    width: 100%;
    justify-content: flex-start;
    padding: 10px 14px;
    min-height: 44px;
    border-radius: 10px;
    font-size: 0.875rem;
    gap: 12px;
  }

  .nav-tab:active { transform: none; }

  .nav-tab--on {
    background: rgba(59, 130, 246, 0.12);
    border-color: transparent;
    color: #3b82f6;
  }

  .nav-tab:not(.nav-tab--on):hover {
    background: var(--bg-elev);
    color: var(--text);
  }

  .nav-icon { width: 20px; height: 20px; }

  .nav-badge { margin-left: auto; }
}

/* Large desktop */
@media (min-width: 1440px) {
  .admin-nav { width: 280px; }
  .nav-brand { padding: 26px 24px 22px; }
  .nav-scroll { padding: 20px 16px; }
  .nav-tab { padding: 12px 16px; min-height: 48px; }
}
</style>