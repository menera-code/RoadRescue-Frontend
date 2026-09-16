<script setup>
import { ref, computed } from 'vue'
import {
  LEGAL_TOPICS,
  LEGAL_CATEGORIES,
  LEGAL_UPDATED,
  searchLegal,
  severityLabel,
  categoryIcon,
} from '@/data/legal'

// ---------- State ----------
const searchQuery = ref('')
const activeCategory = ref('all')
const expandedId = ref(null)

// ---------- Derived ----------
const categoryCounts = computed(() => {
  const counts = { all: LEGAL_TOPICS.length }
  for (const t of LEGAL_TOPICS) {
    counts[t.category] = (counts[t.category] || 0) + 1
  }
  return counts
})

const filtered = computed(() => {
  let list = LEGAL_TOPICS
  if (activeCategory.value !== 'all') {
    list = list.filter((t) => t.category === activeCategory.value)
  }
  return searchLegal(searchQuery.value, list)
})

// ---------- Actions ----------
function toggle(id) {
  expandedId.value = expandedId.value === id ? null : id
}

function severityTone(severity) {
  return `severity--${severity}`
}
</script>

<template>
  <section class="legal-tab">
    <!-- Header (scrolls away) -->
    <header class="head">
      <h1 class="h1">Legal Info</h1>
      <p class="muted">Philippine traffic laws & fines.</p>
    </header>

    <!-- Updated banner (scrolls away) -->
    <div class="updated-banner">
      <span class="updated-icon" aria-hidden="true">⚠️</span>
      <div>
        <p class="updated-title">Last updated {{ LEGAL_UPDATED }}</p>
        <p class="updated-text">
          LTO rules change frequently — verify before relying on any figure.
        </p>
      </div>
    </div>

    <!-- ============================================================
         STICKY TOOLBAR: search + filter chips stay pinned while
         scrolling the topic list below.
         ============================================================ -->
    <div class="sticky-tools">
      <!-- Search -->
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
          placeholder="Search violation, law, or keyword…"
          aria-label="Search legal topics"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="search-clear"
          aria-label="Clear search"
          @click="searchQuery = ''"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <!-- Category chips -->
      <div class="chips" role="tablist">
        <button
          v-for="cat in LEGAL_CATEGORIES"
          :key="cat.key"
          type="button"
          role="tab"
          :aria-selected="activeCategory === cat.key"
          class="chip"
          :class="{ 'chip--on': activeCategory === cat.key }"
          @click="activeCategory = cat.key"
        >
          {{ cat.label }}
          <span v-if="categoryCounts[cat.key]" class="chip-count">
            {{ categoryCounts[cat.key] }}
          </span>
        </button>
      </div>
    </div>

    <!-- Results count -->
    <p class="results-count tiny">
      {{ filtered.length }}
      {{ filtered.length === 1 ? 'result' : 'results' }}
      <template v-if="searchQuery"> for "{{ searchQuery }}"</template>
    </p>

    <!-- Empty state -->
    <div v-if="!filtered.length" class="empty">
      <div class="empty-icon" aria-hidden="true">🔍</div>
      <p class="empty-title">No matching violations</p>
      <p class="empty-text">
        Try a different keyword, or clear your filters.
      </p>
    </div>

    <!-- Topic list -->
    <ul v-else class="list">
      <li
        v-for="topic in filtered"
        :key="topic.id"
        class="topic"
        :class="{ 'topic--open': expandedId === topic.id }"
      >
        <!-- Collapsed head (always visible) -->
        <button
          type="button"
          class="topic-head"
          :aria-expanded="expandedId === topic.id"
          @click="toggle(topic.id)"
        >
          <span class="topic-icon" aria-hidden="true">
            {{ categoryIcon(topic.category) }}
          </span>

          <span class="topic-main">
            <span class="topic-title">{{ topic.title }}</span>
            <span class="topic-summary">{{ topic.summary }}</span>

            <span class="topic-meta">
              <span
                class="severity"
                :class="severityTone(topic.severity)"
              >
                {{ severityLabel(topic.severity) }}
              </span>
              <span class="topic-law">{{ topic.lawReference }}</span>
            </span>

            <span class="topic-fine">{{ topic.fine }}</span>
          </span>

          <span class="topic-chev" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
              <path
                d="m6 9 6 6 6-6"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
        </button>

        <!-- Expanded details -->
        <div
          v-if="expandedId === topic.id"
          class="topic-body"
        >
          <div class="detail-block">
            <p class="detail-label">💰 Fine</p>
            <p class="detail-value detail-value--fine">{{ topic.fine }}</p>
          </div>

          <div
            v-if="topic.consequences && topic.consequences.length"
            class="detail-block"
          >
            <p class="detail-label">⚖️ Consequences</p>
            <ul class="consequence-list">
              <li v-for="(c, i) in topic.consequences" :key="i">
                {{ c }}
              </li>
            </ul>
          </div>

          <div class="detail-block">
            <p class="detail-label">📖 Law Reference</p>
            <p class="detail-value">{{ topic.lawReference }}</p>
          </div>

          <div v-if="topic.details" class="detail-block">
            <p class="detail-label">📝 Details</p>
            <p class="detail-text">{{ topic.details }}</p>
          </div>
        </div>
      </li>
    </ul>

    <!-- Footer disclaimer -->
    <p class="disclaimer tiny">
      Informational only — not legal advice. For the latest rules, visit
      <a href="https://lto.gov.ph" target="_blank" rel="noopener">lto.gov.ph</a>
      or consult the official gazette.
    </p>
  </section>
</template>

<style scoped>
.legal-tab {
  display: flex;
  flex-direction: column;
}

/* ---------- Header ---------- */
.head {
  margin-bottom: 16px;
}
.head .h1 {
  font-size: 1.5rem;
}
.head .muted {
  margin-top: 4px;
}

/* ---------- Updated banner ---------- */
.updated-banner {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 14px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: var(--radius);
  margin-bottom: 14px;
}
.updated-icon {
  font-size: 1rem;
  line-height: 1.3;
  flex-shrink: 0;
}
.updated-title {
  font-size: 0.8125rem;
  font-weight: 700;
  color: #f59e0b;
  margin-bottom: 2px;
}
.updated-text {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.4;
}

/* ============================================================
   STICKY TOOLBAR (search + chips)
   ============================================================ */
.sticky-tools {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg);

  /* Full-bleed background — break out of tab-stage side padding */
  margin-left: calc(-1 * (20px + env(safe-area-inset-left, 0px)));
  margin-right: calc(-1 * (20px + env(safe-area-inset-right, 0px)));
  padding-left: calc(20px + env(safe-area-inset-left, 0px));
  padding-right: calc(20px + env(safe-area-inset-right, 0px));

  padding-top: 10px;
  padding-bottom: 10px;
  margin-bottom: 12px;

  /* Subtle shadow to separate from scrolling content below */
  box-shadow: 0 6px 12px -8px rgba(0, 0, 0, 0.6);
}

/* ---------- Search ---------- */
.search-wrap {
  position: relative;
  margin-bottom: 10px;
}
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
  min-height: 46px;
  padding: 12px 42px 12px 42px;
  font-size: 16px;
  background: var(--bg-input);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  outline: none;
  transition: border-color 0.15s ease;
}
.search-input:focus {
  border-color: var(--border-focus);
}
.search-input::placeholder {
  color: var(--text-dim);
}
.search-clear {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--bg-elev);
  border: none;
  color: var(--text-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
}

/* ---------- Category chips ---------- */
.chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.chips::-webkit-scrollbar {
  display: none;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-height: 34px;
  padding: 6px 12px;
  border-radius: 99px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.8125rem;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.chip:active {
  transform: scale(0.96);
}
.chip--on {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.chip-count {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.2);
  font-size: 0.6875rem;
  font-weight: 700;
}
.chip--on .chip-count {
  background: rgba(255, 255, 255, 0.28);
}

/* ---------- Results count ---------- */
.results-count {
  margin-bottom: 10px;
  padding-left: 4px;
}

/* ---------- Empty ---------- */
.empty {
  background: var(--bg-elev);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  padding: 36px 24px;
  text-align: center;
}
.empty-icon {
  font-size: 2rem;
  line-height: 1;
  margin-bottom: 10px;
  opacity: 0.8;
}
.empty-title {
  font-size: 0.9375rem;
  font-weight: 650;
  margin-bottom: 4px;
}
.empty-text {
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: 1.5;
}

/* ---------- Topic list ---------- */
.list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.topic {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: border-color 0.15s ease;
}
.topic--open {
  border-color: rgba(230, 57, 70, 0.4);
}

.topic-head {
  display: grid;
  grid-template-columns: 36px 1fr 20px;
  gap: 10px;
  align-items: flex-start;
  width: 100%;
  padding: 14px;
  background: none;
  border: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s ease;
}
.topic-head:active {
  background: var(--bg-input);
}

.topic-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--bg-input);
  display: grid;
  place-items: center;
  font-size: 1.125rem;
  flex-shrink: 0;
}

.topic-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.topic-title {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1.3;
}

.topic-summary {
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.topic-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 2px;
}

.severity {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 8px;
  border-radius: 6px;
}
.severity--minor {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.14);
}
.severity--moderate {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.14);
}
.severity--serious {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.14);
}
.severity--critical {
  color: #fff;
  background: #dc2626;
}

.topic-law {
  font-size: 0.6875rem;
  color: var(--text-dim);
}

.topic-fine {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--primary);
  margin-top: 4px;
}

.topic-chev {
  display: grid;
  place-items: center;
  color: var(--text-dim);
  transition: transform 0.2s ease;
  margin-top: 8px;
}
.topic--open .topic-chev {
  transform: rotate(180deg);
}

.topic-body {
  padding: 0 14px 14px;
  border-top: 1px solid var(--border);
  animation: expand 0.2s ease;
}
@keyframes expand {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.detail-block {
  margin-top: 14px;
}
.detail-label {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.detail-value {
  font-size: 0.9375rem;
  color: var(--text);
  line-height: 1.5;
}
.detail-value--fine {
  font-size: 1.125rem;
  font-weight: 750;
  color: var(--primary);
}
.detail-text {
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.6;
}

.consequence-list {
  list-style: none;
  padding: 0;
}
.consequence-list li {
  position: relative;
  padding-left: 18px;
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.55;
  margin-bottom: 4px;
}
.consequence-list li::before {
  content: '•';
  position: absolute;
  left: 6px;
  color: var(--primary);
  font-weight: 700;
}

/* ---------- Footer disclaimer ---------- */
.disclaimer {
  text-align: center;
  line-height: 1.5;
  padding: 8px 12px 4px;
}
.disclaimer a {
  color: var(--primary);
  text-decoration: underline;
}
</style>