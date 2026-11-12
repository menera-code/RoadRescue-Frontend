
<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  photoUrls: {
    type: Array,
    default: () => [],
  },
  videoUrl: {
    type: String,
    default: null,
  },
  mode: {
    type: String,
    default: 'full',
    validator: (v) => ['compact', 'full'].includes(v),
  },
})

const lightboxIndex = ref(-1)
const videoRetryKey = ref(0)
const videoError = ref(false)
const videoLoading = ref(true)

const isLightboxOpen = computed(() => lightboxIndex.value >= 0)

watch(
  () => props.videoUrl,
  () => {
    videoRetryKey.value++
    videoError.value = false
    videoLoading.value = true
  }
)

function openLightbox(index) {
  lightboxIndex.value = index
}

function closeLightbox() {
  lightboxIndex.value = -1
}

function nextPhoto() {
  if (!props.photoUrls.length) return

  lightboxIndex.value =
    (lightboxIndex.value + 1) % props.photoUrls.length
}

function prevPhoto() {
  if (!props.photoUrls.length) return

  lightboxIndex.value =
    (lightboxIndex.value - 1 + props.photoUrls.length) %
    props.photoUrls.length
}

function retryVideo() {
  videoError.value = false
  videoLoading.value = true
  videoRetryKey.value++
}

function onVideoLoaded() {
  videoLoading.value = false
  videoError.value = false
}

function onVideoError(event) {
  console.error(
    '[MediaGallery] Video playback failed:',
    event.target?.error
  )

  videoLoading.value = false
  videoError.value = true
}
</script>

<template>
  <div
    v-if="props.photoUrls.length || props.videoUrl"
    :class="['gallery', `gallery--${props.mode}`]"
  >
    <!-- PHOTOS -->
    <div v-if="props.photoUrls.length" class="gallery__photos">
      <button
        v-for="(url, index) in props.photoUrls"
        :key="`${index}-${url}`"
        type="button"
        class="gallery__thumb"
        :aria-label="`Open photo ${index + 1} of ${props.photoUrls.length}`"
        @click="openLightbox(index)"
      >
        <img
          :src="url"
          alt="Incident evidence"
          loading="lazy"
        />
      </button>
    </div>

    <!-- VIDEO -->
    <div v-if="props.videoUrl" class="gallery__video">
      <div v-if="videoLoading && !videoError" class="video-loading">
        <span class="video-spinner"></span>
        <span>Loading video...</span>
      </div>

      <video
        v-if="!videoError"
        :key="videoRetryKey"
        :src="props.videoUrl"
        controls
        playsinline
        webkit-playsinline
        preload="metadata"
        @loadedmetadata="onVideoLoaded"
        @canplay="onVideoLoaded"
        @error="onVideoError"
      >
        Your browser does not support HTML5 video.
      </video>

      <div v-if="videoError" class="video-error">
        <span class="video-error-icon">⚠️</span>

        <p class="video-error-title">
          Unable to play this video
        </p>

        <p class="video-error-text">
          The video may be unavailable, unsupported, or the connection
          may have been interrupted.
        </p>

        <button
          type="button"
          class="video-retry"
          @click="retryVideo"
        >
          ↻ Retry video
        </button>
      </div>
    </div>
  </div>

  <!-- PHOTO LIGHTBOX -->
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
          type="button"
          class="lightbox__close"
          aria-label="Close photo viewer"
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
          v-if="props.photoUrls.length > 1"
          type="button"
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
          :src="props.photoUrls[lightboxIndex]"
          alt="Incident evidence fullscreen"
          @click.stop
        />

        <button
          v-if="props.photoUrls.length > 1"
          type="button"
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
          {{ lightboxIndex + 1 }} / {{ props.photoUrls.length }}
        </p>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.gallery {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* PHOTOS */
.gallery__photos {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.gallery__thumb {
  flex-shrink: 0;
  width: 76px;
  height: 76px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-input);
  cursor: pointer;
  transition: transform 0.15s ease;
}

.gallery__thumb:active {
  transform: scale(0.94);
}

.gallery__thumb img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

/* COMPACT MODE */
.gallery--compact .gallery__photos {
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
}

.gallery--compact .gallery__photos::-webkit-scrollbar {
  display: none;
}

.gallery--compact .gallery__thumb {
  width: 68px;
  height: 68px;
}

.gallery--compact .gallery__video video {
  max-height: 180px;
}

/* FULL MODE */
.gallery--full .gallery__photos {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
}

.gallery--full .gallery__thumb {
  width: 100%;
  height: auto;
  aspect-ratio: 1;
}

.gallery__video {
  position: relative;
  width: 100%;
  min-width: 0;
  border-radius: 12px;
  overflow: hidden;
  background: #000;
}

.gallery__video video {
  display: block;
  width: 100%;
  max-height: 320px;
  background: #000;
  object-fit: contain;
  border-radius: 12px;
}

.gallery--full .gallery__video video {
  max-height: 420px;
}

/* VIDEO LOADING */
.video-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px;
  color: #fff;
  font-size: 0.8125rem;
}

.video-spinner {
  width: 17px;
  height: 17px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: #fff;
  border-radius: 50%;
  animation: video-spin 0.8s linear infinite;
}

@keyframes video-spin {
  to {
    transform: rotate(360deg);
  }
}

/* VIDEO ERROR */
.video-error {
  padding: 24px 16px;
  text-align: center;
  color: #fff;
  background: #171717;
}

.video-error-icon {
  font-size: 1.7rem;
}

.video-error-title {
  font-weight: 700;
  margin: 8px 0 4px;
}

.video-error-text {
  font-size: 0.8rem;
  line-height: 1.5;
  color: #aaa;
  max-width: 300px;
  margin: 0 auto 14px;
}

.video-retry {
  padding: 9px 16px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-weight: 650;
  cursor: pointer;
}

/* LIGHTBOX */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

<!-- Teleported lightbox styles -->
<style>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.96);
  display: grid;
  place-items: center;
  padding: 20px;
}

.lightbox__img {
  max-width: 100%;
  max-height: calc(100dvh - 100px);
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}

.lightbox__close,
.lightbox__nav {
  position: absolute;
  display: grid;
  place-items: center;
  border: none;
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px);
  cursor: pointer;
}

.lightbox__close {
  top: calc(env(safe-area-inset-top, 0px) + 16px);
  right: 16px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
}

.lightbox__nav {
  top: 50%;
  transform: translateY(-50%);
  width: 46px;
  height: 46px;
  border-radius: 50%;
}

.lightbox__nav--prev {
  left: 12px;
}

.lightbox__nav--next {
  right: 12px;
}

.lightbox__counter {
  position: absolute;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 14px;
  border-radius: 99px;
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
  font-size: 0.8125rem;
  font-weight: 600;
}
</style>
