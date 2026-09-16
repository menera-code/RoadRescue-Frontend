<script setup>
const props = defineProps({
  modelValue: {
    type: String,
    required: true,
    validator: (v) => ['map', 'feed', 'profile'].includes(v),
  },
  pendingCount: { type: Number, default: 0 },
})

const emit = defineEmits(['update:modelValue'])

const TABS = [
  { key: 'map',     label: 'Map',     icon: 'map' },
  { key: 'feed',    label: 'Feed',    icon: 'feed', center: true },
  { key: 'profile', label: 'Profile', icon: 'user' },
]

function select(key) {
  if (key === props.modelValue) return
  emit('update:modelValue', key)
}
</script>

<template>
  <nav class="bottom-nav" role="tablist" aria-label="Responder navigation">
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
        <template v-if="tab.center">
          <span class="center-ring">
            <span class="center-btn">
              <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
                <path d="M22 12h-6l-2 3h-4l-2-3H2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span
                v-if="pendingCount > 0"
                class="center-badge"
                :aria-label="`${pendingCount} pending`"
              >
                {{ pendingCount > 9 ? '9+' : pendingCount }}
              </span>
            </span>
          </span>
          <span class="nav-label nav-label--center">{{ tab.label }}</span>
        </template>

        <template v-else>
          <span class="nav-icon">
            <svg v-if="tab.icon === 'map'" viewBox="0 0 24 24" fill="none" width="22" height="22">
              <path d="M12 21s-6-5.6-6-10a6 6 0 1 1 12 0c0 4.4-6 10-6 10Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
              <circle cx="12" cy="11" r="2.2" stroke="currentColor" stroke-width="2" />
            </svg>
            <svg v-else-if="tab.icon === 'user'" viewBox="0 0 24 24" fill="none" width="22" height="22">
              <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2" />
              <path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
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
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;
  display: flex; justify-content: center; pointer-events: none;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.nav-inner {
  position: relative; display: grid; grid-template-columns: repeat(3, 1fr);
  width: 100%; max-width: 520px;
  background: rgba(18, 28, 46, 0.92); backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px); border-top: 1px solid var(--border);
  pointer-events: auto; padding: 6px 6px 4px;
  padding-left: max(6px, env(safe-area-inset-left));
  padding-right: max(6px, env(safe-area-inset-right));
}
@media (min-width: 600px) {
  .nav-inner { border-top-left-radius: 20px; border-top-right-radius: 20px; border-bottom: none; box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.3); }
}
.nav-item {
  position: relative; display: flex; flex-direction: column; align-items: center;
  justify-content: flex-end; gap: 2px; min-height: 52px; padding: 6px 4px;
  background: none; border: none; color: var(--text-dim);
  font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.02em;
  cursor: pointer; transition: color 0.15s ease, transform 0.12s ease;
  -webkit-tap-highlight-color: transparent;
}
.nav-item:active { transform: scale(0.94); }
.nav-item--active { color: var(--accent); }
.nav-item--active .nav-icon svg { filter: drop-shadow(0 0 6px rgba(47, 158, 115, 0.45)); }
.nav-icon { display: grid; place-items: center; width: 26px; height: 26px; }
.nav-label { font-size: 0.625rem; line-height: 1; }
.nav-item--center { justify-content: flex-end; padding-top: 0; }
.center-ring {
  position: absolute; top: -26px; left: 50%; transform: translateX(-50%);
  width: 62px; height: 62px; border-radius: 50%; background: var(--bg-elev);
  display: grid; place-items: center;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35), 0 0 0 4px var(--bg);
}
.center-btn {
  position: relative; width: 54px; height: 54px; border-radius: 50%;
  background: linear-gradient(160deg, #3cb886 0%, var(--accent) 55%, #267a58 100%);
  color: #fff; display: grid; place-items: center;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
  box-shadow: 0 4px 12px rgba(47, 158, 115, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
.nav-item--center:active .center-btn { transform: scale(0.94); }
.nav-item--center.nav-item--active .center-btn {
  box-shadow: 0 6px 20px rgba(47, 158, 115, 0.65), 0 0 0 6px rgba(47, 158, 115, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.nav-label--center { margin-top: 40px; color: inherit; }
.nav-item--center.nav-item--active .nav-label--center { color: var(--accent); }
.center-badge {
  position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px;
  padding: 0 5px; border-radius: 10px; background: var(--primary); color: #fff;
  font-size: 0.6875rem; font-weight: 700; line-height: 20px; text-align: center;
  box-shadow: 0 0 0 2.5px var(--bg-elev);
  animation: badge-pulse 2s ease-in-out infinite;
}
@keyframes badge-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.08); }
}
</style>