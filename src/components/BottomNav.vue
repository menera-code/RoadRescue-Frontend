<script setup>
/**
 * BottomNav — 5-tab navigation for the citizen dashboard.
 * Layout: 4 regular tabs flanking an elevated center "Map" button.
 * Profile is triggered from the avatar in HomeTab, not a nav tab.
 */

const props = defineProps({
  modelValue: {
    type: String,
    required: true,
    validator: (v) =>
      ['home', 'history', 'map', 'report', 'legal'].includes(v),
  },
})

const emit = defineEmits(['update:modelValue'])

const TABS = [
  { key: 'home',    label: 'Home',    icon: 'home' },
  { key: 'history', label: 'History', icon: 'history' },
  { key: 'map',     label: 'Map',     icon: 'map', center: true },
  { key: 'report',  label: 'Report',  icon: 'report' },
  { key: 'legal',   label: 'Legal',   icon: 'legal' },
]

function select(key) {
  if (key === props.modelValue) return
  emit('update:modelValue', key)
}
</script>

<template>
  <nav class="bottom-nav" role="tablist" aria-label="Primary navigation">
    <div class="nav-inner">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="modelValue === tab.key"
        :aria-label="tab.label"
        class="nav-item"
        :class="{
          'nav-item--active': modelValue === tab.key,
          'nav-item--center': tab.center,
        }"
        @click="select(tab.key)"
      >
        <!-- Center elevated button (Map) -->
        <template v-if="tab.center">
          <span class="center-ring">
            <span class="center-btn">
              <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
                <path
                  d="M12 21s-6-5.6-6-10a6 6 0 1 1 12 0c0 4.4-6 10-6 10Z"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linejoin="round"
                />
                <circle cx="12" cy="11" r="2.2" stroke="currentColor" stroke-width="2" />
              </svg>
            </span>
          </span>
          <span class="nav-label nav-label--center">{{ tab.label }}</span>
        </template>

        <!-- Regular tabs -->
        <template v-else>
          <span class="nav-icon">
            <!-- Home -->
            <svg v-if="tab.icon === 'home'" viewBox="0 0 24 24" fill="none" width="22" height="22">
              <path d="M3 10.5 12 3l9 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>

            <!-- History -->
            <svg v-else-if="tab.icon === 'history'" viewBox="0 0 24 24" fill="none" width="22" height="22">
              <path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>

            <!-- Report -->
            <svg v-else-if="tab.icon === 'report'" viewBox="0 0 24 24" fill="none" width="22" height="22">
              <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
              <path d="M14 3v6h6" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
              <path d="M8 14h6M8 18h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>

            <!-- Legal (scales of justice) -->
            <svg v-else-if="tab.icon === 'legal'" viewBox="0 0 24 24" fill="none" width="22" height="22">
              <path d="M12 3v18M7 21h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <path d="M5 6h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <path d="M5 6 3 12a3 3 0 0 0 6 0L7 6M19 6l-2 6a3 3 0 0 0 6 0l-2-6" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
            </svg>
          </span>
          <span class="nav-label">{{ tab.label }}</span>
        </template>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  pointer-events: none;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.nav-inner {
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  width: 100%;
  max-width: 520px;
  background: rgba(18, 28, 46, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid var(--border);
  pointer-events: auto;
  padding: 6px 6px 4px;
  padding-left: max(6px, env(safe-area-inset-left));
  padding-right: max(6px, env(safe-area-inset-right));
}

@media (min-width: 600px) {
  .nav-inner {
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    border-bottom: none;
    box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.3);
  }
}

.nav-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  min-height: 52px;
  padding: 6px 4px;
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: color 0.15s ease, transform 0.12s ease;
  -webkit-tap-highlight-color: transparent;
}

.nav-item:active { transform: scale(0.94); }
.nav-item--active { color: var(--primary); }
.nav-item--active .nav-icon svg { filter: drop-shadow(0 0 6px rgba(230, 57, 70, 0.45)); }

.nav-icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
}

.nav-label {
  font-size: 0.625rem;
  line-height: 1;
}

.nav-item--center {
  justify-content: flex-end;
  padding-top: 0;
}

.center-ring {
  position: absolute;
  top: -26px;
  left: 50%;
  transform: translateX(-50%);
  width: 62px;
  height: 62px;
  border-radius: 50%;
  background: var(--bg-elev);
  display: grid;
  place-items: center;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35), 0 0 0 4px var(--bg);
}

.center-btn {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: linear-gradient(160deg, #f14b57 0%, var(--primary) 55%, var(--primary-dark) 100%);
  color: #fff;
  display: grid;
  place-items: center;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
  box-shadow: 0 4px 12px rgba(230, 57, 70, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.nav-item--center:active .center-btn { transform: scale(0.94); }
.nav-item--center.nav-item--active .center-btn {
  box-shadow: 0 6px 20px rgba(230, 57, 70, 0.65), 0 0 0 6px rgba(230, 57, 70, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.nav-label--center { margin-top: 40px; color: inherit; }
.nav-item--center.nav-item--active .nav-label--center { color: var(--primary); }
</style>