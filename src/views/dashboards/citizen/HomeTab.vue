<script setup>
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import AppLogo from '@/components/AppLogo.vue'

const emit = defineEmits(['open-profile'])

const auth = useAuthStore()

const firstName = computed(() => {
  const full = auth.profile?.fullName || ''
  return full.split(' ')[0] || 'there'
})

const initials = computed(() => {
  const full = auth.profile?.fullName || ''
  return full
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('')
})

const HOTLINES = [
  { label: 'Emergency (life-threatening)', number: '911', icon: '🚨' },
  { label: 'PNP Calapan', number: '(043) 288-7777', icon: '👮' },
  { label: 'BFP Calapan', number: '(043) 288-4444', icon: '🚒' },
]

function call(number) {
  const cleaned = number.replace(/[^\d+]/g, '')
  window.location.href = `tel:${cleaned}`
}
</script>

<template>
  <section class="home-tab">
    <header class="head">
      <button
        type="button"
        class="avatar avatar--button"
        aria-label="Open profile"
        @click="emit('open-profile')"
      >
        {{ initials || '👤' }}
      </button>
      <div class="head-text">
        <p class="tiny">Welcome back</p>
        <h1 class="h2">Hi, {{ firstName }}</h1>
      </div>
    </header>

    <div class="hero-card">
      <div class="hero-icon" aria-hidden="true">🛞</div>
      <h2 class="hero-title">Road trouble?</h2>
      <p class="hero-sub">
        Flat tire, breakdown, crash, or hazard — report it and a nearby
        barangay responder will be dispatched to you.
      </p>
      <div class="hero-hint">
        <span class="hero-hint-icon" aria-hidden="true">👇</span>
        Tap <strong>Report</strong> in the bar below
      </div>
    </div>

    <div class="emergency-card">
      <div class="emergency-head">
        <span class="emergency-icon" aria-hidden="true">🚨</span>
        <div>
          <h3 class="emergency-title">Someone injured?</h3>
          <p class="emergency-sub">
            For life-threatening injuries, call 911 first.
          </p>
        </div>
      </div>

      <button
        class="emergency-cta"
        @click="call('911')"
        aria-label="Call 911 emergency hotline"
      >
        <span class="emergency-number">911</span>
        <span class="emergency-call-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.4c.9.4 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </button>

      <div class="hotlines">
        <button
          v-for="h in HOTLINES.slice(1)"
          :key="h.number"
          class="hotline"
          @click="call(h.number)"
        >
          <span class="hotline-icon" aria-hidden="true">{{ h.icon }}</span>
          <span class="hotline-body">
            <span class="hotline-label">{{ h.label }}</span>
            <span class="hotline-number">{{ h.number }}</span>
          </span>
        </button>
      </div>
    </div>

    <div class="spacer" />

    <footer class="foot">
      <AppLogo :size="24" />
      <span class="tiny">RoadRescue · Calapan City</span>
    </footer>
  </section>
</template>

<style scoped>
.home-tab { display: flex; flex-direction: column; min-height: 100%; }

.head { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }

.avatar {
  width: 46px; height: 46px; border-radius: 50%; background: var(--primary);
  color: #fff; display: grid; place-items: center;
  font-weight: 700; font-size: 0.9375rem; flex-shrink: 0;
}
.avatar--button {
  border: none; cursor: pointer; transition: transform 0.12s ease;
  padding: 0; font-family: inherit; -webkit-tap-highlight-color: transparent;
}
.avatar--button:active { transform: scale(0.92); }

.head-text { min-width: 0; }
.head-text .h2 { margin-top: 2px; }

.hero-card {
  background:
    radial-gradient(120% 100% at 50% 0%, var(--primary-soft) 0%, transparent 60%),
    var(--bg-elev);
  border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 26px 22px 22px; text-align: center; margin-bottom: 20px;
}
.hero-icon { font-size: 2.5rem; line-height: 1; margin-bottom: 10px; }
.hero-title { font-size: 1.25rem; font-weight: 750; margin-bottom: 8px; }
.hero-sub {
  font-size: 0.9375rem; color: var(--text-muted); line-height: 1.5;
  max-width: 32ch; margin: 0 auto 18px;
}
.hero-hint {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 0.8125rem; color: var(--primary); background: var(--primary-soft);
  border: 1px solid rgba(230, 57, 70, 0.25); padding: 8px 14px;
  border-radius: 99px; font-weight: 500;
}
.hero-hint strong { color: var(--primary); font-weight: 700; }
.hero-hint-icon {
  font-size: 0.875rem; animation: nudge-down 1.8s ease-in-out infinite;
}
@keyframes nudge-down {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(3px); }
}

.emergency-card {
  background: var(--bg-elev); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 18px; margin-bottom: 16px;
}
.emergency-head {
  display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
}
.emergency-icon { font-size: 1.5rem; line-height: 1; flex-shrink: 0; }
.emergency-title { font-size: 0.9375rem; font-weight: 700; margin-bottom: 2px; }
.emergency-sub { font-size: 0.75rem; color: var(--text-muted); line-height: 1.4; }

.emergency-cta {
  display: flex; align-items: center; justify-content: center; gap: 12px;
  width: 100%; min-height: 56px; padding: 10px 20px;
  border: none; border-radius: var(--radius);
  background: linear-gradient(160deg, #f14b57 0%, var(--primary) 55%, var(--primary-dark) 100%);
  color: #fff; cursor: pointer;
  box-shadow: 0 6px 16px rgba(230, 57, 70, 0.35);
  transition: transform 0.12s ease; margin-bottom: 12px;
}
.emergency-cta:active { transform: scale(0.98); }
.emergency-number { font-size: 1.5rem; font-weight: 800; letter-spacing: 0.02em; }
.emergency-call-icon {
  display: grid; place-items: center; width: 30px; height: 30px;
  border-radius: 50%; background: rgba(255, 255, 255, 0.18);
}

.hotlines { display: grid; gap: 8px; }
.hotline {
  display: flex; align-items: center; gap: 12px;
  width: 100%; padding: 10px 12px;
  background: var(--bg-input); border: 1px solid var(--border);
  border-radius: var(--radius); color: var(--text);
  cursor: pointer; text-align: left; min-height: 50px;
  transition: all 0.15s ease;
}
.hotline:active { transform: scale(0.98); background: var(--bg-elev); }
.hotline-icon {
  font-size: 1.0625rem; width: 30px; height: 30px;
  display: grid; place-items: center; background: var(--bg-elev);
  border-radius: 8px; flex-shrink: 0;
}
.hotline-body {
  display: flex; flex-direction: column; min-width: 0; flex: 1;
}
.hotline-label { font-size: 0.8125rem; font-weight: 600; line-height: 1.2; }
.hotline-number { font-size: 0.75rem; color: var(--text-muted); margin-top: 1px; }

.spacer { flex: 1; min-height: 12px; }
.foot {
  display: flex; align-items: center; justify-content: center;
  gap: 8px; padding-top: 16px;
}
</style>