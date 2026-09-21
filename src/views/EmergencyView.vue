<script setup>
import { useRouter } from 'vue-router'
import EmergencyButton from '@/components/EmergencyButton.vue'
import AppLogo from '@/components/AppLogo.vue'

const router = useRouter()

function goToLogin() {
  router.push({ name: 'login' }) // change to your actual login route name
}

function goToHome() {
  router.push({ name: 'home' }) // change to your actual home route name
}
</script>

<template>
  <main class="sos-page">
    <div class="sos-container">

      <!-- Header -->
      <header class="sos-header">
        <AppLogo :size="40" />
        <h1 class="sos-title">Quick Emergency</h1>
        <p class="sos-subtitle">
          No login needed. Tap the button and help is notified instantly.
        </p>
      </header>

      <!-- The button -->
      <EmergencyButton />

      <!-- What happens next -->
      <section class="sos-info">
        <h2 class="info-title">What happens when you tap</h2>
        <ul class="info-list">
          <li>
            <span class="info-icon" aria-hidden="true">📍</span>
            <div>
              <p class="info-item-title">Your GPS location is captured</p>
              <p class="info-item-text tiny">
                We find the nearest barangay to send help from.
              </p>
            </div>
          </li>
          <li>
            <span class="info-icon" aria-hidden="true">🎤</span>
            <div>
              <p class="info-item-title">10-second voice message</p>
              <p class="info-item-text tiny">
                Say what happened. Admin hears it before dispatching.
              </p>
            </div>
          </li>
          <li>
            <span class="info-icon" aria-hidden="true">🚑</span>
            <div>
              <p class="info-item-title">Admin reviews and dispatches</p>
              <p class="info-item-text tiny">
                The nearest responder is alerted by SMS.
              </p>
            </div>
          </li>
        </ul>
      </section>

      <!-- Warning -->
      <div class="sos-warning">
        <p class="tiny">
          <strong>Not for pranks.</strong> False reports may delay help to
          real emergencies. If this is life-threatening, also call
          <strong>911</strong>.
        </p>
      </div>

      <!-- Bottom links -->
      <footer class="sos-footer">
        <button class="link" @click="goToLogin">Sign in</button>
        <span class="link-sep" aria-hidden="true">·</span>
        <button class="link" @click="goToHome">Report a road incident</button>
      </footer>

    </div>
  </main>
</template>

<style scoped>
.sos-page {
  min-height: 100dvh;
  background:
    radial-gradient(90% 60% at 50% 0%, rgba(230, 57, 70, 0.12) 0%, transparent 70%),
    var(--bg, #0b1220);
  color: var(--text, #eaf0fa);
  display: flex;
  justify-content: center;
  padding: 24px 16px calc(env(safe-area-inset-bottom, 0px) + 24px);
}

.sos-container {
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Header */
.sos-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding-top: 8px;
}

.sos-title {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-top: 4px;
}

.sos-subtitle {
  font-size: 0.875rem;
  color: var(--text-muted, #93a3bd);
  line-height: 1.5;
  max-width: 36ch;
}

/* Info */
.sos-info {
  background: var(--bg-elev, #121c2e);
  border: 1px solid var(--border, #22304a);
  border-radius: var(--radius-lg, 18px);
  padding: 20px;
}

.info-title {
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted, #93a3bd);
  margin-bottom: 14px;
}

.info-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0;
}

.info-list li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.info-icon {
  font-size: 1.25rem;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 2px;
}

.info-item-title {
  font-size: 0.9375rem;
  font-weight: 650;
  margin-bottom: 2px;
}

.info-item-text {
  line-height: 1.5;
}

/* Warning */
.sos-warning {
  padding: 14px 16px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius, 14px);
  color: #f59e0b;
  line-height: 1.5;
  text-align: center;
}
.sos-warning strong { color: #f59e0b; }

/* Footer */
.sos-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding-top: 8px;
}

.link {
  background: none;
  border: none;
  color: var(--text-muted, #93a3bd);
  font-size: 0.8125rem;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
  padding: 4px 6px;
}
.link:hover { color: var(--text, #eaf0fa); }
.link-sep { color: var(--text-muted, #93a3bd); }

@media (min-width: 640px) {
  .sos-title { font-size: 1.75rem; }
  .sos-subtitle { font-size: 0.9375rem; }
}
</style>
