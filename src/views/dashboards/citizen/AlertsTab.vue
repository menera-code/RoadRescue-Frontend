<script setup>
import { ref } from 'vue'

// Placeholder — will be wired to Firestore notifications later
const alerts = ref([])

function formatDate(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const now = new Date()
  const diff = Math.floor((now - d) / 1000)

  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <section class="alerts-tab">
    <header class="head">
      <h1 class="h1">Alerts</h1>
      <p class="muted">Notifications about your requests and account.</p>
    </header>

    <!-- Empty state -->
    <div v-if="alerts.length === 0" class="empty">
      <div class="empty-icon" aria-hidden="true">🔔</div>
      <p class="empty-title">You're all caught up</p>
      <p class="empty-text">
        When a responder accepts your request or an admin sends you a message,
        it'll appear here.
      </p>
    </div>

    <!-- Alerts list (ready for real data) -->
    <ul v-else class="list">
      <li v-for="a in alerts" :key="a.id" class="item">
        <div class="item-icon" aria-hidden="true">
          {{ a.icon || '🔔' }}
        </div>
        <div class="item-body">
          <p class="item-title">{{ a.title }}</p>
          <p class="item-text">{{ a.body }}</p>
          <p class="tiny item-time">{{ formatDate(a.createdAt) }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.alerts-tab {
  display: flex;
  flex-direction: column;
}

.head {
  margin-bottom: 20px;
}

.head .h1 {
  font-size: 1.5rem;
}

.head .muted {
  margin-top: 4px;
}

/* ---------- Empty ---------- */
.empty {
  background: var(--bg-elev);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  padding: 40px 24px;
  text-align: center;
  margin-top: 8px;
}

.empty-icon {
  font-size: 2.25rem;
  line-height: 1;
  margin-bottom: 12px;
  opacity: 0.8;
}

.empty-title {
  font-size: 1rem;
  font-weight: 650;
  margin-bottom: 6px;
}

.empty-text {
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.5;
  max-width: 32ch;
  margin-inline: auto;
}

/* ---------- List ---------- */
.list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item {
  display: flex;
  gap: 12px;
  padding: 14px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.item-icon {
  font-size: 1.25rem;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  background: var(--bg-input);
  border-radius: 10px;
  flex-shrink: 0;
}

.item-body {
  min-width: 0;
  flex: 1;
}

.item-title {
  font-size: 0.9375rem;
  font-weight: 650;
  margin-bottom: 2px;
}

.item-text {
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: 1.45;
  margin-bottom: 4px;
}

.item-time {
  margin-top: 2px;
}
</style>