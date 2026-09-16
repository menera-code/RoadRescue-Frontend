<script setup>
import logoUrl from '@/assets/logo.png'

defineProps({
  size: { type: Number, default: 44 },
  alt: { type: String, default: 'RoadRescue' },
})
</script>

<template>
  <div
    class="app-logo-wrap"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <img
      :src="logoUrl"
      :alt="alt"
      class="app-logo"
      draggable="false"
    />
  </div>
</template>

<style scoped>
.app-logo-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border-radius: 22%;              /* soft rounded square, matches iOS/macOS style */
  padding: 6%;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.25),
    0 1px 3px rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}

.app-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}
</style>