<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: { type: String, required: true },
  pendingCount: { type: Number, default: 0 },
})
const emit = defineEmits(['update:modelValue'])

const BOTTOM_LEFT = [
  { key: 'history', label: 'History',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 8v4l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/></svg>` },
  { key: 'barangays', label: 'Barangays',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-6.5-7-11.5a7 7 0 1114 0C19 14.5 12 21 12 21z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.5" stroke="currentColor" stroke-width="2"/></svg>` },
]

const BOTTOM_RIGHT = [
  { key: 'users', label: 'Users',
    icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3.5" stroke="currentColor" stroke-width="2"/><path d="M2.5 20c0-3.3 3-6 6.5-6s6.5 2.7 6.5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 4.5a3.5 3.5 0 010 7M22 20c0-2.8-2.3-5-5-5.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>` },
]

const MORE_ITEMS = [
  { key: 'analytics', label: 'Analytics', desc: 'Charts & metrics',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>` },
  { key: 'insights', label: 'Operational Insights', desc: 'ML analytics & trends',
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.2 1 2.1V17h6v-.2c0-.9.4-1.6 1-2.1A7 7 0 0012 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` },
  { key: 'profile', label: 'Profile', desc: 'Your admin account',
    icon: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="9" r="3.5" stroke="currentColor" stroke-width="2"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>` },
]

const DESKTOP_TABS = [
  { key: 'verify', label: 'Verify', badge: true,
    icon: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/></svg>` },
  ...BOTTOM_LEFT,
  ...BOTTOM_RIGHT,
  ...MORE_ITEMS.map((i) => ({ ...i, label: i.label.replace('Operational ', '') })),
]

const showMore = ref(false)
const overflowActive = computed(() =>
  MORE_ITEMS.some((i) => i.key === props.modelValue)
)

function select(key) {
  emit('update:modelValue', key)
  showMore.value = false
}
</script>

<template>
  <!-- ============================================================
       DESKTOP SIDEBAR (≥ 1024px)
       ============================================================ -->
  <nav class="desktop-nav" aria-label="Admin navigation">
    <div class="nav-brand">
      <span class="brand-mark" aria-hidden="true">⚡</span>
      <div class="brand-text">
        <p class="brand-title">RoadRescue</p>
        <p class="brand-sub">Admin Console</p>
      </div>
    </div>

    <div class="desktop-list">
      <button
        v-for="tab in DESKTOP_TABS"
        :key="tab.key"
        type="button"
        class="desktop-tab"
        :class="{ 'desktop-tab--on': modelValue === tab.key }"
        :aria-current="modelValue === tab.key ? 'page' : undefined"
        @click="select(tab.key)"
      >
        <span class="desktop-icon" aria-hidden="true" v-html="tab.icon" />
        <span class="desktop-label">{{ tab.label }}</span>
        <span
          v-if="tab.badge && pendingCount > 0"
          class="desktop-badge"
        >{{ pendingCount > 99 ? '99+' : pendingCount }}</span>
      </button>
    </div>
  </nav>

  <!-- ============================================================
       MOBILE BOTTOM BAR (≤ 1023px)
       5 flex children: 2 left tabs · FAB spacer · 2 right tabs
       ============================================================ -->
  <nav class="bottom-nav" aria-label="Admin navigation">
    <button
      v-for="tab in BOTTOM_LEFT"
      :key="tab.key"
      type="button"
      class="bottom-tab"
      :class="{ 'bottom-tab--on': modelValue === tab.key }"
      :aria-current="modelValue === tab.key ? 'page' : undefined"
      @click="select(tab.key)"
    >
      <span class="bottom-icon" aria-hidden="true" v-html="tab.icon" />
      <span class="bottom-label">{{ tab.label }}</span>
    </button>

    <!-- Reserve space for the elevated FAB -->
    <div class="bottom-fab-slot" aria-hidden="true" />

    <button
      v-for="tab in BOTTOM_RIGHT"
      :key="tab.key"
      type="button"
      class="bottom-tab"
      :class="{ 'bottom-tab--on': modelValue === tab.key }"
      :aria-current="modelValue === tab.key ? 'page' : undefined"
      @click="select(tab.key)"
    >
      <span class="bottom-icon" aria-hidden="true" v-html="tab.icon" />
      <span class="bottom-label">{{ tab.label }}</span>
    </button>

    <button
      type="button"
      class="bottom-tab"
      :class="{ 'bottom-tab--on': overflowActive || showMore }"
      @click="showMore = true"
    >
      <span class="bottom-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="5" cy="12" r="1.75" fill="currentColor" />
          <circle cx="12" cy="12" r="1.75" fill="currentColor" />
          <circle cx="19" cy="12" r="1.75" fill="currentColor" />
        </svg>
      </span>
      <span class="bottom-label">More</span>
    </button>
  </nav>

  <!-- Elevated Verify FAB — pinned above the bar -->
  <button
    type="button"
    class="verify-fab"
    :class="{ 'verify-fab--on': modelValue === 'verify' }"
    :aria-label="`Verify — ${pendingCount} pending`"
    @click="select('verify')"
  >
    <span class="verify-fab__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" />
      </svg>
    </span>
    <span class="verify-fab__label">Verify</span>
    <span v-if="pendingCount > 0" class="verify-fab__badge" aria-hidden="true">
      {{ pendingCount > 99 ? '99+' : pendingCount }}
    </span>
  </button>

  <!-- More sheet -->
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="showMore"
        class="more-root"
        role="dialog"
        aria-modal="true"
        aria-label="More sections"
        @click.self="showMore = false"
      >
        <div class="more-backdrop" @click="showMore = false" />

        <div class="more-sheet">
          <div class="more-grabber" />

          <header class="more-head">
            <h2 class="more-title">More sections</h2>
            <button type="button" class="more-close" aria-label="Close" @click="showMore = false">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" />
              </svg>
            </button>
          </header>

          <ul class="more-list">
            <li v-for="item in MORE_ITEMS" :key="item.key">
              <button
                type="button"
                class="more-item"
                :class="{ 'more-item--on': modelValue === item.key }"
                @click="select(item.key)"
              >
                <span class="more-item__icon" aria-hidden="true" v-html="item.icon" />
                <span class="more-item__body">
                  <span class="more-item__label">{{ item.label }}</span>
                  <span class="more-item__desc">{{ item.desc }}</span>
                </span>
                <span v-if="modelValue === item.key" class="more-item__check" aria-hidden="true">✓</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Default: mobile only, desktop hidden */
.desktop-nav { display: none; }
.bottom-nav { display: flex; }
.verify-fab { display: flex; }

/* ============================================================
   MOBILE BOTTOM BAR — flex with explicit FAB slot
   ============================================================ */
.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;

  display: flex;
  align-items: stretch;
  height: 64px;
  padding-bottom: env(safe-area-inset-bottom, 0px);

  /* Fully opaque — content scrolling beneath disappears cleanly */
  background: #121c2e;
  border-top: 1px solid var(--border);
  box-shadow: 0 -6px 18px rgba(0, 0, 0, 0.35);
}

.bottom-tab {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 64px;
  padding: 6px 2px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-family: inherit;
  cursor: pointer;
  transition: color 0.15s ease, transform 0.12s ease;
  -webkit-tap-highlight-color: transparent;
}
.bottom-tab:active { transform: scale(0.94); }
.bottom-tab--on { color: #3b82f6; }

.bottom-icon {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}
.bottom-icon :deep(svg) { width: 100%; height: 100%; }

.bottom-label {
  font-size: 0.625rem;
  font-weight: 650;
  letter-spacing: 0.01em;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* Reserved column where the FAB sits — same width as a tab */
.bottom-fab-slot {
  flex: 1 1 0;
  min-width: 0;
}

/* ============================================================
   ELEVATED VERIFY FAB
   ============================================================ */
.verify-fab {
  position: fixed;
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 14px);
  transform: translateX(-50%);
  z-index: 60;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;

  width: 68px;
  height: 68px;
  border-radius: 50%;
  border: 4px solid #121c2e;
  background: linear-gradient(160deg, #4f8ff7 0%, #3b82f6 55%, #2563eb 100%);
  color: #fff;
  font-family: inherit;
  cursor: pointer;

  box-shadow: 0 8px 22px rgba(59, 130, 246, 0.5);
  transition: transform 0.15s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.verify-fab:active { transform: translateX(-50%) scale(0.94); }

.verify-fab--on {
  background: linear-gradient(160deg, #3cb886 0%, #2f9e73 55%, #267a58 100%);
  box-shadow: 0 8px 22px rgba(47, 158, 115, 0.55);
}

.verify-fab__icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
}
.verify-fab__icon :deep(svg) { width: 100%; height: 100%; }

.verify-fab__label {
  font-size: 0.5625rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  line-height: 1;
}

.verify-fab__badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  background: #e63946;
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  border: 2px solid #121c2e;
  box-shadow: 0 3px 8px rgba(230, 57, 70, 0.55);
}

/* Tiny phones — shrink labels + FAB slightly */
@media (max-width: 380px) {
  .bottom-label { font-size: 0.5625rem; }
  .bottom-icon { width: 20px; height: 20px; }
  .verify-fab { width: 62px; height: 62px; }
  .verify-fab__icon { width: 22px; height: 22px; }
}

/* ============================================================
   MORE SHEET
   ============================================================ */
.more-root {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.more-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
}
.more-sheet {
  position: relative;
  background: var(--bg-elev);
  border-top-left-radius: 22px;
  border-top-right-radius: 22px;
  border: 1px solid var(--border);
  border-bottom: none;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
  animation: sheet-up 0.24s ease;
}
@keyframes sheet-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.more-grabber {
  width: 40px;
  height: 4px;
  background: var(--border);
  border-radius: 99px;
  margin: 10px auto 4px;
}
.more-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px 12px;
}
.more-title { font-size: 1rem; font-weight: 700; }
.more-close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-input);
  border: none;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  cursor: pointer;
}
.more-list {
  list-style: none;
  padding: 0 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.more-item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px;
  min-height: 62px;
  background: var(--bg-input);
  border: 1px solid transparent;
  border-radius: 12px;
  color: var(--text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}
.more-item:active { transform: scale(0.98); }
.more-item--on {
  background: rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.4);
}
.more-item__icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  color: #3b82f6;
}
.more-item__icon :deep(svg) { width: 100%; height: 100%; }
.more-item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.more-item__label { font-size: 0.9375rem; font-weight: 700; }
.more-item__desc { font-size: 0.75rem; color: var(--text-muted); line-height: 1.3; }
.more-item__check { color: #3b82f6; font-weight: 800; font-size: 1.125rem; }

.sheet-enter-active, .sheet-leave-active { transition: opacity 0.2s ease; }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }

/* ============================================================
   DESKTOP
   ============================================================ */
@media (min-width: 1024px) {
  .bottom-nav,
  .verify-fab { display: none; }

  .desktop-nav {
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 248px;
    background: var(--bg);
    border-right: 1px solid var(--border);
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    overflow-y: auto;
    z-index: 50;
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

  .desktop-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 16px 12px;
    flex: 1;
  }

  .desktop-tab {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 14px;
    min-height: 44px;
    border-radius: 10px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 650;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .desktop-tab:hover:not(.desktop-tab--on) {
    background: var(--bg-elev);
    color: var(--text);
  }
  .desktop-tab--on {
    background: rgba(59, 130, 246, 0.12);
    color: #3b82f6;
  }
  .desktop-icon {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }
  .desktop-icon :deep(svg) { width: 100%; height: 100%; }
  .desktop-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .desktop-badge {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: #e63946;
    color: #fff;
    font-size: 0.625rem;
    font-weight: 800;
    line-height: 1;
    flex-shrink: 0;
  }
}

@media (min-width: 1440px) {
  .desktop-nav { width: 280px; }
  .nav-brand { padding: 26px 24px 22px; }
  .desktop-list { padding: 20px 16px; }
  .desktop-tab { padding: 12px 16px; min-height: 48px; }
}
</style>