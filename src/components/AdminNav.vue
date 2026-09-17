<script setup>
/**
 * AdminNav — responsive navigation.
 *
 * 7 tabs: History · Barangays · Analytics · Verify · Insights · Users · Profile
 *
 * Mobile  (<768px):  bottom bar, Verify elevated in the center (position 4 of 7)
 * Desktop (>=768px): horizontal top bar with all tabs equal
 */

const props = defineProps({
  modelValue: {
    type: String,
    required: true,
    validator: (v) =>
      ['history', 'barangays', 'analytics', 'verify', 'insights', 'users', 'profile']
        .includes(v),
  },
  pendingCount: { type: Number, default: 0 },
})

const emit = defineEmits(['update:modelValue'])

const TABS = [
  { key: 'history',   label: 'History',   icon: 'clock' },
  { key: 'barangays', label: 'Barangays', icon: 'grid' },
  { key: 'analytics', label: 'Analytics', icon: 'chart' },
  { key: 'verify',    label: 'Verify',    icon: 'verify', center: true },
  { key: 'insights',  label: 'Insights',  icon: 'insight' },
  { key: 'users',     label: 'Users',     icon: 'users' },
  { key: 'profile',   label: 'Profile',   icon: 'user' },
]

function select(key) {
  if (key === props.modelValue) return
  emit('update:modelValue', key)
}
</script>

<template>
  <nav class="admin-nav" role="tablist" aria-label="Admin navigation">
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
        <span class="nav-icon">
          <!-- Verify (center, with badge) -->
          <template v-if="tab.center">
            <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
              <path
                d="M9 12l2 2 4-4"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M12 2 4 6v6c0 5 3.4 9 8 10 4.6-1 8-5 8-10V6l-8-4Z"
                stroke="currentColor"
                stroke-width="2"
                stroke-linejoin="round"
              />
            </svg>
            <span
              v-if="pendingCount > 0"
              class="center-badge"
              :aria-label="`${pendingCount} unverified`"
            >
              {{ pendingCount > 9 ? '9+' : pendingCount }}
            </span>
          </template>

          <!-- History -->
          <svg
            v-else-if="tab.icon === 'clock'"
            viewBox="0 0 24 24"
            fill="none"
            width="22"
            height="22"
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
            <path
              d="M12 7v5l3 2"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>

          <!-- Barangays -->
          <svg
            v-else-if="tab.icon === 'grid'"
            viewBox="0 0 24 24"
            fill="none"
            width="22"
            height="22"
          >
            <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2" />
          </svg>

          <!-- Analytics -->
          <svg
            v-else-if="tab.icon === 'chart'"
            viewBox="0 0 24 24"
            fill="none"
            width="22"
            height="22"
          >
            <path
              d="M3 3v18h18"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <rect x="7" y="13" width="3" height="6" rx="0.5" stroke="currentColor" stroke-width="2" />
            <rect x="12" y="9" width="3" height="10" rx="0.5" stroke="currentColor" stroke-width="2" />
            <rect x="17" y="6" width="3" height="13" rx="0.5" stroke="currentColor" stroke-width="2" />
          </svg>

          <!-- Insights (lightbulb) -->
          <svg
            v-else-if="tab.icon === 'insight'"
            viewBox="0 0 24 24"
            fill="none"
            width="22"
            height="22"
          >
            <path
              d="M9 18h6M10 21h4"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.5 1 2.5h6c0-1 .3-1.9 1-2.5A6 6 0 0 0 12 3Z"
              stroke="currentColor"
              stroke-width="2"
              stroke-linejoin="round"
            />
          </svg>

          <!-- Users (people) -->
          <svg
            v-else-if="tab.icon === 'users'"
            viewBox="0 0 24 24"
            fill="none"
            width="22"
            height="22"
          >
            <circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="2" />
            <path
              d="M3 20a6 6 0 0 1 12 0"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
            <path
              d="M16 5.5a3 3 0 0 1 0 5.5M21 20a5 5 0 0 0-3-4.6"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>

          <!-- Profile -->
          <svg
            v-else-if="tab.icon === 'user'"
            viewBox="0 0 24 24"
            fill="none"
            width="22"
            height="22"
          >
            <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2" />
            <path
              d="M4 21a8 8 0 0 1 16 0"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </span>

        <span class="nav-label">{{ tab.label }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
/* =========================================================
   MOBILE (<768px) — bottom nav, 7 items, Verify at center
   ========================================================= */

.admin-nav {
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
  grid-template-columns: repeat(7, 1fr);
  width: 100%;
  max-width: 620px;
  background: rgba(18, 28, 46, 0.94);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid var(--border);
  pointer-events: auto;
  padding: 6px 2px 4px;
  padding-left: max(2px, env(safe-area-inset-left));
  padding-right: max(2px, env(safe-area-inset-right));
}

.nav-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  min-height: 52px;
  padding: 6px 0;
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: color 0.15s ease, transform 0.12s ease;
  -webkit-tap-highlight-color: transparent;
  min-width: 0;
}

.nav-item:active {
  transform: scale(0.94);
}

.nav-item--active {
  color: #3b82f6;
}

.nav-item--active .nav-icon svg {
  filter: drop-shadow(0 0 6px rgba(59, 130, 246, 0.5));
}

.nav-icon {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  position: relative;
}

.nav-icon svg {
  width: 20px;
  height: 20px;
}

.nav-label {
  font-size: 0.5rem;
  line-height: 1;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  letter-spacing: 0;
}

/* Center elevated button — mobile only */
.nav-item--center {
  justify-content: flex-end;
  padding-top: 0;
}

.nav-item--center .nav-icon {
  position: absolute;
  top: -46px;
  left: 50%;
  transform: translateX(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(160deg, #4f8ff7 0%, #3b82f6 55%, #2563eb 100%);
  color: #fff;
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.35),
    0 0 0 4px var(--bg),
    0 4px 12px rgba(59, 130, 246, 0.5);
  transition: transform 0.15s ease, box-shadow 0.2s ease;
  display: grid;
  place-items: center;
}

.nav-item--center .nav-icon svg {
  width: 22px;
  height: 22px;
}

.nav-item--center:active .nav-icon {
  transform: translateX(-50%) scale(0.94);
}

.nav-item--center.nav-item--active .nav-icon {
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.35),
    0 0 0 4px var(--bg),
    0 6px 20px rgba(59, 130, 246, 0.7),
    0 0 0 10px rgba(59, 130, 246, 0.18);
}

.nav-item--center .nav-label {
  margin-top: 30px;
}

.center-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--primary);
  color: #fff;
  font-size: 0.625rem;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  box-shadow: 0 0 0 2.5px var(--bg-elev);
  animation: badge-pulse 2s ease-in-out infinite;
}

@keyframes badge-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.08); }
}

/* ----------------------------------------------------------
   Very small phones (<=380px) — icons only for non-active
   ---------------------------------------------------------- */
@media (max-width: 380px) {
  .nav-item:not(.nav-item--center):not(.nav-item--active) .nav-label {
    display: none;
  }
  .nav-item:not(.nav-item--center) {
    min-height: 46px;
    justify-content: center;
  }
  .nav-item--active:not(.nav-item--center) .nav-label {
    font-size: 0.5625rem;
    margin-top: 3px;
  }
}

/* ----------------------------------------------------------
   Ultra small (<=320px) — hide ALL labels
   ---------------------------------------------------------- */
@media (max-width: 320px) {
  .nav-label {
    display: none;
  }
  .nav-item {
    justify-content: center;
    padding: 6px 0;
  }
  .nav-item--center .nav-label {
    display: block;
    margin-top: 34px;
    font-size: 0.5rem;
  }
}

/* =========================================================
   TABLET + DESKTOP (>=768px) — top horizontal nav, 7 items
   ========================================================= */
@media (min-width: 768px) {
  .admin-nav {
    position: sticky;
    top: 0;
    bottom: auto;
    padding-bottom: 0;
    background: rgba(18, 28, 46, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
    border-top: none;
    z-index: 100;
  }

  .nav-inner {
    max-width: 1400px;
    margin-inline: auto;
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border: none;
    padding: 8px 20px;
    grid-template-columns: repeat(7, auto);
    justify-content: center;
    gap: 4px;
  }

  .nav-item {
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 6px;
    padding: 10px 12px;
    min-height: 42px;
    border-radius: 10px;
    font-size: 0.8125rem;
    font-weight: 650;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .nav-item:hover {
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
  }

  .nav-item:active {
    transform: scale(0.98);
  }

  .nav-item--active {
    background: rgba(59, 130, 246, 0.14);
    color: #3b82f6;
  }

  .nav-icon {
    width: 18px;
    height: 18px;
  }

  .nav-icon svg {
    width: 17px;
    height: 17px;
  }

  .nav-label {
    font-size: 0.8125rem;
    margin-top: 0;
    letter-spacing: 0;
  }

  /* Cancel the mobile elevated styling */
  .nav-item--center {
    padding-top: 10px;
  }

  .nav-item--center .nav-icon {
    position: relative;
    top: auto;
    left: auto;
    transform: none;
    width: 18px;
    height: 18px;
    border-radius: 0;
    background: none;
    box-shadow: none;
    transition: none;
  }

  .nav-item--center .nav-icon svg {
    width: 17px;
    height: 17px;
  }

  .nav-item--center:active .nav-icon,
  .nav-item--center.nav-item--active .nav-icon {
    transform: none;
    box-shadow: none;
  }

  .nav-item--center .nav-label {
    margin-top: 0;
  }

  .center-badge {
    top: -6px;
    right: -10px;
    min-width: 16px;
    height: 16px;
    font-size: 0.5625rem;
    line-height: 16px;
  }
}

/* =========================================================
   LARGE DESKTOP (>=1024px) — more breathing room
   ========================================================= */
@media (min-width: 1024px) {
  .nav-inner {
    gap: 8px;
    padding: 10px 28px;
  }

  .nav-item {
    padding: 10px 16px;
    font-size: 0.875rem;
  }

  .nav-icon svg {
    width: 18px;
    height: 18px;
  }
}

/* =========================================================
   VERY WIDE (>=1440px) — comfortable spacing
   ========================================================= */
@media (min-width: 1440px) {
  .nav-inner {
    gap: 10px;
  }

  .nav-item {
    padding: 10px 20px;
    font-size: 0.9375rem;
  }
}
</style>