<script setup>
import { ref, computed } from 'vue'
import { useSystemLogs } from '@/composables/useSystemLogs'

const { logs, loading, error } = useSystemLogs()

const searchQuery = ref('')
const levelFilter = ref('all')
const categoryFilter = ref('all')

const LEVELS = [
  { key: 'all', label: 'All levels' },
  { key: 'success', label: 'Success' },
  { key: 'info', label: 'Info' },
  { key: 'warn', label: 'Warning' },
  { key: 'error', label: 'Error' },
]

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'auth', label: 'Auth' },
  { key: 'user', label: 'Users' },
  { key: 'admin', label: 'Admin' },
  { key: 'incident', label: 'Incidents' },
  { key: 'dispatch', label: 'Dispatch' },
  { key: 'sms', label: 'SMS' },
  { key: 'emergency', label: 'Emergency' },
  { key: 'ai', label: 'AI' },
  { key: 'system', label: 'System' },
  { key: 'ui', label: 'UI' },
]

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return logs.value.filter((l) => {
    if (levelFilter.value !== 'all' && l.level !== levelFilter.value) return false
    if (categoryFilter.value !== 'all' && l.category !== categoryFilter.value) return false
    if (!q) return true
    return (
      (l.message || '').toLowerCase().includes(q) ||
      (l.action || '').toLowerCase().includes(q) ||
      (l.actor?.email || '').toLowerCase().includes(q) ||
      (l.actor?.name || '').toLowerCase().includes(q) ||
      (l.actor?.uid || '').toLowerCase().includes(q)
    )
  })
})

const counts = computed(() => {
  const c = { success: 0, info: 0, warn: 0, error: 0 }
  for (const l of logs.value) {
    if (c[l.level] !== undefined) c[l.level]++
  }
  return c
})

function levelTone(level) {
  return {
    success: 'log-level--success',
    info: 'log-level--info',
    warn: 'log-level--warn',
    error: 'log-level--error',
  }[level] || 'log-level--info'
}

function categoryTone(cat) {
  return `log-cat--${cat || 'system'}`
}

function formatTime(ts) {
  if (!ts) return '—'
  const d = ts instanceof Date ? ts : new Date(ts)
  const time = d.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const date = d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  })
  return `${date} ${time}`
}

function timeAgo(ts) {
  if (!ts) return ''
  const d = ts instanceof Date ? ts : new Date(ts)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function exportCSV() {
  if (!filtered.value.length) return

  const headers = [
    'Timestamp',
    'Level',
    'Category',
    'Action',
    'Message',
    'Actor UID',
    'Actor Email',
    'Actor Name',
    'Actor Role',
    'Target Type',
    'Target ID',
    'Metadata',
    'User Agent',
  ]

  const rows = filtered.value.map((l) => [
    l.timestamp ? new Date(l.timestamp).toISOString() : '',
    l.level || '',
    l.category || '',
    l.action || '',
    l.message || '',
    l.actor?.uid || '',
    l.actor?.email || '',
    l.actor?.name || '',
    l.actor?.role || '',
    l.target?.type || '',
    l.target?.id || '',
    l.metadata ? JSON.stringify(l.metadata) : '',
    l.userAgent || '',
  ])

  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((r) => r.map(csvEscape).join(',')),
  ].join('\n')

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `roadrescue-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function clearFilters() {
  searchQuery.value = ''
  levelFilter.value = 'all'
  categoryFilter.value = 'all'
}
</script>

<template>
  <section class="logs-tab">
    <header class="head">
      <div>
        <h1 class="h1">System Logs</h1>
        <p class="muted">
          Real-time audit trail of every event in the system.
          <strong>{{ logs.length }}</strong> entries loaded.
        </p>
      </div>
      <button class="export-btn" :disabled="!filtered.length" @click="exportCSV">
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
          <path
            d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span>Export CSV</span>
      </button>
    </header>

    <div class="counts">
      <div class="count-chip count-chip--success">
        <span class="count-value">{{ counts.success }}</span>
        <span class="count-label">Success</span>
      </div>
      <div class="count-chip count-chip--info">
        <span class="count-value">{{ counts.info }}</span>
        <span class="count-label">Info</span>
      </div>
      <div class="count-chip count-chip--warn">
        <span class="count-value">{{ counts.warn }}</span>
        <span class="count-label">Warning</span>
      </div>
      <div class="count-chip count-chip--error">
        <span class="count-value">{{ counts.error }}</span>
        <span class="count-label">Error</span>
      </div>
    </div>

    <div class="toolbar">
      <div class="search-wrap">
        <span class="search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" />
            <path
              d="m20 20-3.5-3.5"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </span>
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="Search message, action, or actor…"
        />
      </div>

      <select v-model="levelFilter" class="filter-select">
        <option v-for="l in LEVELS" :key="l.key" :value="l.key">
          {{ l.label }}
        </option>
      </select>

      <select v-model="categoryFilter" class="filter-select">
        <option v-for="c in CATEGORIES" :key="c.key" :value="c.key">
          {{ c.label }}
        </option>
      </select>

      <button
        v-if="searchQuery || levelFilter !== 'all' || categoryFilter !== 'all'"
        class="clear-btn"
        @click="clearFilters"
      >
        Clear
      </button>
    </div>

    <div v-if="loading" class="state-block">
      <div class="spinner" />
      <p class="tiny">Connecting to log stream…</p>
    </div>

    <div v-else-if="error" class="state-block state-block--error">
      <p class="tiny">{{ error }}</p>
    </div>

    <div v-else-if="!filtered.length" class="state-block">
      <div class="state-icon" aria-hidden="true">📋</div>
      <p class="state-title">No log entries match</p>
      <p class="tiny state-text">Try clearing filters.</p>
    </div>

    <ul v-else class="log-list">
      <li
        v-for="l in filtered"
        :key="l.id"
        class="log-row"
        :class="`log-row--${l.level || 'info'}`"
      >
        <div class="log-row__head">
          <span class="log-level" :class="levelTone(l.level)">
            {{ (l.level || 'info').toUpperCase() }}
          </span>
          <span class="log-cat" :class="categoryTone(l.category)">
            {{ l.category || 'system' }}
          </span>
          <span class="log-action">{{ l.action || '—' }}</span>
          <span class="log-time" :title="formatTime(l.timestamp)">
            {{ timeAgo(l.timestamp) }}
          </span>
        </div>

        <p class="log-message">{{ l.message || '(no message)' }}</p>

        <div v-if="l.actor || l.target" class="log-meta">
          <span v-if="l.actor" class="meta-chip">
            <span aria-hidden="true">👤</span>
            {{ l.actor.name || l.actor.email || l.actor.uid || 'unknown' }}
            <span v-if="l.actor.role" class="meta-role">· {{ l.actor.role }}</span>
          </span>
          <span v-if="l.target" class="meta-chip">
            <span aria-hidden="true">🎯</span>
            {{ l.target.type }}: {{ (l.target.id || '').slice(0, 12) }}
          </span>
        </div>

        <details v-if="l.metadata && Object.keys(l.metadata).length" class="log-details">
          <summary class="tiny">Details</summary>
          <pre class="log-pre">{{ JSON.stringify(l.metadata, null, 2) }}</pre>
        </details>
      </li>
    </ul>

    <p v-if="filtered.length" class="tiny footer-note">
      Showing {{ filtered.length }} of {{ logs.length }} entries.
    </p>
  </section>
</template>

<style scoped>
.logs-tab { display: flex; flex-direction: column; padding-bottom: 20px; }

.head {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}
.head .h1 { font-size: 1.5rem; }
.head .muted { margin-top: 4px; line-height: 1.5; }
.head .muted strong { color: #3b82f6; }

.export-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 10px;
  background: #3b82f6;
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 650;
  border: none;
  cursor: pointer;
  align-self: flex-start;
  font-family: inherit;
}
.export-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.export-btn:active:not(:disabled) { transform: scale(0.96); }

.counts {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}
.count-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 6px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-elev);
}
.count-chip--success { border-color: rgba(47, 158, 115, 0.35); }
.count-chip--info { border-color: rgba(59, 130, 246, 0.35); }
.count-chip--warn { border-color: rgba(245, 158, 11, 0.35); }
.count-chip--error { border-color: rgba(239, 68, 68, 0.35); }
.count-value {
  font-size: 1.25rem;
  font-weight: 800;
  line-height: 1.1;
  color: var(--text);
}
.count-label {
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-top: 3px;
}
.count-chip--success .count-value { color: #2f9e73; }
.count-chip--info .count-value { color: #3b82f6; }
.count-chip--warn .count-value { color: #f59e0b; }
.count-chip--error .count-value { color: #ef4444; }

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}
.search-wrap { position: relative; flex: 1; }
.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-dim);
  pointer-events: none;
}
.search-input {
  width: 100%;
  min-height: 44px;
  padding: 11px 14px 11px 42px;
  font-size: 15px;
  background: var(--bg-input);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  outline: none;
  font-family: inherit;
}
.search-input:focus { border-color: #3b82f6; }

.filter-select {
  min-height: 44px;
  padding: 10px 14px;
  background: var(--bg-input);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 0.875rem;
  cursor: pointer;
  appearance: none;
  font-family: inherit;
}
.clear-btn {
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.14);
  color: #ef4444;
  border: none;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}

.state-block {
  background: var(--bg-elev);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  padding: 40px 24px;
  text-align: center;
}
.state-block--error { border-color: rgba(239, 68, 68, 0.3); }
.spinner {
  width: 26px; height: 26px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: #3b82f6;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.state-icon { font-size: 2rem; margin-bottom: 10px; opacity: 0.8; }
.state-title { font-size: 0.9375rem; font-weight: 650; margin-bottom: 4px; }
.state-text { line-height: 1.5; max-width: 30ch; margin-inline: auto; }

.log-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.log-row {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-left-width: 3px;
  border-radius: var(--radius);
  padding: 10px 14px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 0.75rem;
}
.log-row--success { border-left-color: #2f9e73; }
.log-row--info { border-left-color: #3b82f6; }
.log-row--warn { border-left-color: #f59e0b; }
.log-row--error { border-left-color: #ef4444; }

.log-row__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.log-level {
  font-size: 0.5625rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 4px;
}
.log-level--success { background: rgba(47, 158, 115, 0.2); color: #2f9e73; }
.log-level--info { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
.log-level--warn { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
.log-level--error { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

.log-cat {
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-muted);
  text-transform: uppercase;
}
.log-cat--auth { color: #8b5cf6; }
.log-cat--admin { color: #f59e0b; }
.log-cat--dispatch { color: #22c55e; }
.log-cat--emergency { color: #ef4444; }
.log-cat--ai { color: #06b6d4; }

.log-action {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text);
}
.log-time {
  margin-left: auto;
  font-size: 0.6875rem;
  color: var(--text-dim);
  white-space: nowrap;
}

.log-message {
  font-family: inherit;
  font-size: 0.8125rem;
  color: var(--text);
  line-height: 1.5;
  word-break: break-word;
  margin-bottom: 6px;
}

.log-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.6875rem;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-muted);
  font-family: inherit;
}
.meta-role { color: #3b82f6; font-weight: 600; }

.log-details {
  margin-top: 8px;
  font-family: inherit;
}
.log-details summary {
  cursor: pointer;
  color: #3b82f6;
  font-weight: 600;
  padding: 2px 0;
}
.log-pre {
  margin-top: 6px;
  padding: 8px 10px;
  background: var(--bg-input);
  border-radius: 6px;
  font-size: 0.6875rem;
  overflow-x: auto;
  color: var(--text-muted);
}

.footer-note {
  text-align: center;
  padding: 16px 8px 8px;
  color: var(--text-dim);
}

@media (min-width: 640px) {
  .head {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
  }
  .head .h1 { font-size: 1.75rem; }
  .export-btn { align-self: flex-start; }

  .toolbar {
    flex-direction: row;
    align-items: center;
  }
  .filter-select { min-width: 150px; }
}

@media (min-width: 1024px) {
  .head .h1 { font-size: 2rem; }
  .head .muted { font-size: 1rem; }
  .counts { max-width: 600px; }
}
</style>