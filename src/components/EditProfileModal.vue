<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  profile: { type: Object, default: () => ({}) },
  role: { type: String, default: 'citizen' },
  saving: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
})

const emit = defineEmits(['close', 'submit'])

const form = ref({
  fullName: '',
  phone: '',
  agency: '',
  badgeId: '',
  licenseNumber: '',
  serviceArea: '',
})

const isResponder = computed(() => props.role === 'responder')

watch(
  () => [props.open, props.profile],
  () => {
    if (!props.open) return
    const p = props.profile || {}
    form.value = {
      fullName: p.fullName || '',
      phone: p.phone || '',
      agency: p.agency || '',
      badgeId: p.badgeId || '',
      licenseNumber: p.licenseNumber || '',
      serviceArea: p.serviceArea || '',
    }
  },
  { immediate: true }
)

function close() {
  if (props.saving) return
  emit('close')
}

function submit() {
  const payload = {
    full_name: (form.value.fullName || '').trim(),
    phone: (form.value.phone || '').trim() || null,
  }

  if (isResponder.value) {
    payload.agency = form.value.agency || null
    payload.badge_id = form.value.badgeId || null
    payload.license_number = form.value.licenseNumber || null
    payload.service_area = form.value.serviceArea || null
  }

  emit('submit', payload)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="modal-root" @click.self="close">
        <div class="modal-backdrop" @click="close" />

        <div class="modal-sheet">
          <div class="modal-grabber" />

          <header class="modal-head">
            <div>
              <h2 class="h2">Edit profile</h2>
              <p class="tiny">
                Update your personal information. Role changes require admin approval.
              </p>
            </div>
            <button class="modal-close" aria-label="Close" @click="close">
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

          <div class="modal-body">
            <div v-if="errorMessage" class="error-banner">
              {{ errorMessage }}
            </div>

            <div class="grid">
              <div class="field span-2">
                <label>Full name *</label>
                <input
                  v-model="form.fullName"
                  type="text"
                  class="input"
                  placeholder="Juan Dela Cruz"
                />
              </div>

              <div class="field span-2">
                <label>Phone number</label>
                <input
                  v-model="form.phone"
                  type="tel"
                  class="input"
                  placeholder="+639171234567"
                />
                <small class="hint">Philippine numbers auto-normalized.</small>
              </div>

              <template v-if="isResponder">
                <div class="section-title span-2">Responder details</div>

                <div class="field">
                  <label>Agency</label>
                  <input v-model="form.agency" class="input" placeholder="Barangay Ilaya" />
                </div>

                <div class="field">
                  <label>Badge / ID</label>
                  <input v-model="form.badgeId" class="input" />
                </div>

                <div class="field">
                  <label>License number</label>
                  <input v-model="form.licenseNumber" class="input" />
                </div>

                <div class="field">
                  <label>Service area</label>
                  <input v-model="form.serviceArea" class="input" placeholder="Quezon City, PH" />
                </div>
              </template>
            </div>

            <p class="tiny locked-note">
              🔒 Role and assigned barangay can only be changed by an admin.
            </p>
          </div>

          <footer class="modal-foot">
            <button class="btn btn--ghost" :disabled="saving" @click="close">
              Cancel
            </button>
            <button class="btn btn--primary" :disabled="saving" @click="submit">
              {{ saving ? 'Saving…' : 'Save changes' }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-root {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
}
.modal-sheet {
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
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
.modal-grabber {
  width: 40px; height: 4px;
  background: var(--border);
  border-radius: 99px;
  margin: 8px auto 4px;
}
.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 20px 14px;
  border-bottom: 1px solid var(--border);
}
.modal-head .h2 { font-size: 1.125rem; font-weight: 700; }
.modal-head .tiny { margin-top: 3px; line-height: 1.4; }
.modal-close {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: var(--bg-input);
  border: none;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px 24px;
}
.modal-foot {
  display: flex;
  gap: 10px;
  padding: 12px 20px 20px;
  border-top: 1px solid var(--border);
}
.modal-foot .btn { flex: 1; }

.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}
.field { display: flex; flex-direction: column; gap: 6px; }
.field label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.field .input {
  min-height: 44px;
  padding: 10px 12px;
  background: var(--bg-input);
  border: 1.5px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 0.9375rem;
  font-family: inherit;
  outline: none;
}
.field .input:focus { border-color: #3b82f6; }
.hint {
  font-size: 0.6875rem;
  color: var(--text-dim);
  padding-left: 2px;
}
.section-title {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding-top: 6px;
  border-top: 1px solid var(--border);
}
.locked-note {
  margin-top: 14px;
  line-height: 1.5;
  color: var(--text-dim);
}
.error-banner {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 0.8125rem;
  color: #ef4444;
  margin-bottom: 14px;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (min-width: 640px) {
  .grid { grid-template-columns: 1fr 1fr; }
  .span-2 { grid-column: span 2; }

  .modal-root { justify-content: center; align-items: center; padding: 24px; }
  .modal-sheet {
    border-radius: 20px;
    border-bottom: 1px solid var(--border);
    width: 100%;
    max-width: 540px;
    max-height: 88dvh;
    animation: dialog-in 0.2s ease;
  }
  @keyframes dialog-in {
    from { transform: scale(0.95); opacity: 0; }
    to   { transform: scale(1);    opacity: 1; }
  }
  .modal-grabber { display: none; }
  .modal-head { padding: 20px 24px 16px; }
  .modal-body { padding: 20px 24px; }
  .modal-foot { padding: 16px 24px; }
}
</style>