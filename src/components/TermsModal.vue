<script setup>
import { ref, watch, computed, nextTick } from 'vue'
import {
  TERMS_SECTIONS,
  TERMS_INTRO,
  TERMS_VERSION,
  TERMS_UPDATED,
} from '@/data/terms'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** Force the user to scroll to the bottom before they can accept */
  requireScroll: { type: Boolean, default: true },
  title: { type: String, default: 'Terms & Privacy Policy' },
  agreeLabel: { type: String, default: 'I Agree' },
})

const emit = defineEmits(['update:modelValue', 'accept', 'decline'])

const scroller = ref(null)
const atBottom = ref(false)

const canAccept = computed(() => !props.requireScroll || atBottom.value)

function onScroll() {
  const el = scroller.value
  if (!el) return
  // 32px tolerance so it triggers near the bottom on momentum scroll endings
  const reached = el.scrollTop + el.clientHeight >= el.scrollHeight - 32
  if (reached) atBottom.value = true
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      document.body.style.overflow = 'hidden'
      await nextTick()
      // If the content fits without scrolling, allow accepting immediately
      const el = scroller.value
      if (el && el.scrollHeight <= el.clientHeight + 8) {
        atBottom.value = true
      }
    } else {
      document.body.style.overflow = ''
      atBottom.value = false
      if (scroller.value) scroller.value.scrollTop = 0
    }
  }
)

function close() {
  emit('update:modelValue', false)
}

function decline() {
  emit('decline')
  close()
}

function accept() {
  if (!canAccept.value) return
  emit('accept')
  close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="modelValue"
        class="sheet-root"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <div class="sheet-backdrop" @click="close" />

        <div class="sheet">
          <div class="sheet-grabber" />

          <header class="sheet-head">
            <div>
              <h2 class="h2">{{ title }}</h2>
              <p class="tiny">
                Version {{ TERMS_VERSION }} · Updated {{ TERMS_UPDATED }}
              </p>
            </div>
            <button class="sheet-close" aria-label="Close" @click="close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </header>

          <div ref="scroller" class="sheet-body" @scroll.passive="onScroll">
            <p class="terms-intro">{{ TERMS_INTRO }}</p>

            <section
              v-for="s in TERMS_SECTIONS"
              :key="s.id"
              class="terms-section"
            >
              <h3 class="terms-title">{{ s.title }}</h3>
              <p
                v-for="(p, i) in s.body"
                :key="i"
                class="terms-para"
              >
                {{ p }}
              </p>
            </section>

            <p class="terms-end">
              — End of Terms · Version {{ TERMS_VERSION }} —
            </p>
          </div>

          <footer class="sheet-foot">
            <button class="btn btn--ghost" @click="decline">Decline</button>
            <button
              class="btn btn--primary"
              :disabled="!canAccept"
              @click="accept"
            >
              {{ canAccept ? agreeLabel : 'Scroll to continue' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.sheet-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
}

.sheet {
  position: relative;
  background: var(--bg-elev);
  border-top-left-radius: 22px;
  border-top-right-radius: 22px;
  border: 1px solid var(--border);
  border-bottom: none;
  display: flex;
  flex-direction: column;
  max-height: 92dvh;
  padding-bottom: var(--sab);
  animation: sheet-up 0.24s ease;
}

@keyframes sheet-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.sheet-grabber {
  width: 40px;
  height: 4px;
  background: var(--border);
  border-radius: 99px;
  margin: 8px auto 4px;
}

.sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 20px 12px;
  border-bottom: 1px solid var(--border);
}

.sheet-close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-input);
  border: none;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.sheet-body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px 20px 24px;
  overscroll-behavior: contain;
}

.terms-intro {
  font-size: 0.9375rem;
  color: var(--text-muted);
  margin-bottom: 20px;
}

.terms-section {
  margin-bottom: 20px;
}

.terms-title {
  font-size: 0.9375rem;
  font-weight: 700;
  margin-bottom: 6px;
  color: var(--text);
}

.terms-para {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 8px;
  line-height: 1.6;
}

.terms-end {
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-dim);
  padding: 12px 0;
}

.sheet-foot {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg-elev);
}

.sheet-foot .btn {
  flex: 1;
}

.sheet-foot .btn--ghost {
  flex: 0.6;
}
</style>