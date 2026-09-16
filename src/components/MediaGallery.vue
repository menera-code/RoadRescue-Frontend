<script setup>
import { ref, computed } from 'vue'

/**
 * MediaGallery — displays incident photos + video.
 *
 * Modes:
 *   compact → small thumbnail strip (feed cards)
 *   full    → large gallery with tap-to-expand (detail sheet)
 *
 * Tapping a thumbnail opens a fullscreen overlay with swipe-through.
 */

const props = defineProps({
  photoUrls: { type: Array, default: () => [] },
  videoUrl: { type: String, default: null },
  mode: {
    type: String,
    default: 'full',
    validator: (v) => ['compact', 'full'].includes(v),
  },
})

const lightboxIndex = ref(-1)
const isLightboxOpen = computed(() => lightboxIndex.value >= 0)

function openLightbox(i) {
  lightboxIndex.value = i
}

function closeLightbox() {
  lightboxIndex.value = -1
}

function nextPhoto() {
  if (!props.photoUrls.length) return
  lightboxIndex.value = (lightboxIndex.value + 1) % props.photoUrls.length
}

function prevPhoto() {
  if (!props.photoUrls.length) return
  lightboxIndex.value =
    (lightboxIndex.value - 1 + props.photoUrls.length) % props.photoUrls.length
}
</script>

<template>
  <div v-if="photoUrls.length || videoUrl" :class="['gallery', `gallery--${mode}`]">
    <!-- Photos -->
    <div v-if="photoUrls.length" class="gallery__photos">
      <button
        v-for="(url, i) in photoUrls"
        :key="i"
        type="button"
        class="gallery__thumb"
        :aria-label="`Open photo ${i + 1} of ${photoUrls.length}`"
        @click="openLightbox(i)"
      >
        <img :src="url" alt="" loading="lazy" />
      </button>
    </div>

    <!-- Video -->
    <div v-if="videoUrl" class="gallery__video">
      <video :src="videoUrl" controls preload="metadata" />
    </div>
  </div>

  <!-- ==================== LIGHTBOX ==================== -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isLightboxOpen"
        class="lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="Photo viewer"
        @click.self="closeLightbox"
      >
        <button
          class="lightbox__close"
          aria-label="Close"
          @click="closeLightbox"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
            />
          </svg>
        </button>

        <button
          v-if="photoUrls.length > 1"
          class="lightbox__nav lightbox__nav--prev"
          aria-label="Previous photo"
          @click.stop="prevPhoto"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="m15 18-6-6 6-6"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>

        <img
          class="lightbox__img"
          :src="photoUrls[lightboxIndex]"
          alt=""
          @click.stop
        />

        <button
          v-if="photoUrls.length > 1"
          class="lightbox__nav lightbox__nav--next"
          aria-label="Next photo"
          @click.stop="nextPhoto"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="m9 18 6-6-6-6"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>

        <p class="lightbox__counter">
          {{ lightboxIndex + 1 }} / {{ photoUrls.length }}
        </p>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ---------- Base ---------- */
.gallery {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ---------- Compact mode (feed cards) ---------- */
.gallery--compact .gallery__photos {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.gallery--compact .gallery__photos::-webkit-scrollbar {
  display: none;
}

.gallery--compact .gallery__thumb {
  flex-shrink: 0;
  width: 68px;
  height: 68px;
  border-radius: 10px;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--border);
  background: var(--bg-input);
  cursor: pointer;
  transition: transform 0.12s ease;
}
.gallery--compact .gallery__thumb:active {
  transform: scale(0.94);
}
.gallery--compact .gallery__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.gallery--compact .gallery__video video {
  width: 100%;
  max-height: 160px;
  border-radius: 10px;
  background: #000;
  display: block;
}

/* ---------- Full mode (detail sheet) ---------- */
.gallery--full .gallery__photos {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 8px;
}

.gallery--full .gallery__thumb {
  aspect-ratio: 1;
  border-radius: var(--radius);
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--border);
  background: var(--bg-input);
  cursor: pointer;
  transition: transform 0.12s ease;
}
.gallery--full .gallery__thumb:active {
  transform: scale(0.96);
}
.gallery--full .gallery__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.gallery--full .gallery__video video {
  width: 100%;
  max-height: 300px;
  border-radius: var(--radius);
  background: #000;
  display: block;
}
</style>

<!-- Lightbox needs to be unscoped because it's teleported to body -->
<style>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.95);
  display: grid;
  place-items: center;
  padding: 20px;
  animation: lightbox-fade 0.2s ease;
}

@keyframes lightbox-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.lightbox__img {
  max-width: 100%;
  max-height: calc(100dvh - 80px);
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}

.lightbox__close {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 16px);
  right: 16px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: none;
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.lightbox__close:active {
  transform: scale(0.9);
}

.lightbox__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: none;
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.lightbox__nav--prev { left: 16px; }
.lightbox__nav--next { right: 16px; }

.lightbox__nav:active {
  transform: translateY(-50%) scale(0.9);
}

.lightbox__counter {
  position: absolute;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
  left: 50%;
  transform: translateX(-50%);
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  padding: 6px 14px;
  border-radius: 99px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>