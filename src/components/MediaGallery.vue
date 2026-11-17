
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
  },
})

// Photo lightbox
const lightboxIndex = ref(-1)

const isLightboxOpen = computed(
  () => lightboxIndex.value >= 0
)

// Video state
const videoError = ref(false)
const videoLoading = ref(false)

const videoPlayer = ref(null)

// Reset when Firebase URL changes
watch(
  () => props.videoUrl,
  () => {
    videoError.value = false
    videoLoading.value = false
  }
)

function onVideoLoadStart() {
  videoLoading.value = true
  videoError.value = false
}

function onVideoReady() {
  videoLoading.value = false
  videoError.value = false
}

function onVideoError(event) {
  videoLoading.value = false
  videoError.value = true

  const video = event.target

  console.error('[RoadRescue Video] Playback failed:', {
    url: props.videoUrl,
    errorCode: video?.error?.code,
    errorMessage: video?.error?.message,
    networkState: video?.networkState,
    readyState: video?.readyState,
  })
}

function retryVideo() {
  videoError.value = false

  const player = videoPlayer.value

  if (!player) return

  player.load()
}

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
</script>

<template>
  <div
    v-if="props.photoUrls.length || props.videoUrl"
    :class="['gallery', `gallery--${props.mode}`]"
  >

    <!-- PHOTOS -->
    <div
      v-if="props.photoUrls.length"
      class="gallery__photos"
    >
      <button
        v-for="(url, index) in props.photoUrls"
        :key="`${index}-${url}`"
        type="button"
        class="gallery__thumb"
        @click="openLightbox(index)"
      >
        <img
          :src="url"
          alt="Incident evidence"
          loading="lazy"
        />
      </button>
    </div>

    <!-- FIREBASE VIDEO -->
    <div
      v-if="props.videoUrl"
      class="gallery__video"
    >

      <div
        v-if="videoLoading"
        class="video-loading"
      >
        Loading video from Firebase...
      </div>

      <!-- Direct Firebase download URL -->
      <video
        v-if="!videoError"
        ref="videoPlayer"
        class="gallery__player"
        :src="props.videoUrl"
        controls
        playsinline
        webkit-playsinline
        preload="metadata"
        @loadstart="onVideoLoadStart"
        @loadedmetadata="onVideoReady"
        @canplay="onVideoReady"
        @error="onVideoError"
      >
        Your browser does not support HTML5 video.
      </video>

      <!-- Playback error -->
      <div
        v-if="videoError"
        class="video-error"
      >
        <div class="video-error-icon">
          ⚠️
        </div>

        <p class="video-error-title">
          Unable to play this video
        </p>

        <p class="video-error-text">
          The Firebase video URL could not be played by this browser.
        </p>

        <div class="video-error-actions">

          <button
            type="button"
            class="video-retry"
            @click="retryVideo"
          >
            ↻ Retry
          </button>

          <a
            :href="props.videoUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="video-open-original"
          >
            Open Firebase Video ↗
          </a>

        </div>
      </div>

    </div>

  </div>

  <!-- PHOTO LIGHTBOX -->
  <Teleport to="body">

    <Transition name="fade">

      <div
        v-if="isLightboxOpen"
        class="lightbox"
        @click.self="closeLightbox"
      >

        <button
          class="lightbox__close"
          @click="closeLightbox"
        >
          ✕
        </button>

        <button
          v-if="props.photoUrls.length > 1"
          class="lightbox__nav lightbox__nav--prev"
          @click.stop="prevPhoto"
        >
          ‹
        </button>

        <img
          class="lightbox__img"
          :src="props.photoUrls[lightboxIndex]"
          alt="Incident evidence"
          @click.stop
        />

        <button
          v-if="props.photoUrls.length > 1"
          class="lightbox__nav lightbox__nav--next"
          @click.stop="nextPhoto"
        >
          ›
        </button>

      </div>

    </Transition>

  </Teleport>
</template>

<style scoped>
.gallery {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

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
}

.gallery__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Compact */
.gallery--compact .gallery__photos {
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
}

.gallery--compact .gallery__thumb {
  width: 68px;
  height: 68px;
}

/* Full */
.gallery--full .gallery__photos {
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(90px, 1fr)
  );
}

.gallery--full .gallery__thumb {
  width: 100%;
  height: auto;
  aspect-ratio: 1;
}

/* Video */
.gallery__video {
  position: relative;
  width: 100%;
  min-width: 0;
  border-radius: 12px;
  overflow: hidden;
  background: #000;
}

.gallery__player {
  display: block;
  width: 100%;
  height: auto;
  min-height: 180px;
  max-height: 420px;
  background: #000;
  object-fit: contain;
  border-radius: 12px;
}

.video-loading {
  padding: 10px;
  color: #fff;
  text-align: center;
  background: #171717;
  font-size: 0.8125rem;
}

/* Error */
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
  font-size: 0.8125rem;
  color: #d1d5db;
  line-height: 1.5;
}

.video-error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  margin-top: 16px;
}

.video-retry,
.video-open-original {
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
}

.video-retry {
  background: #4b5563;
}

.video-open-original {
  background: #2563eb;
}

/* Lightbox */
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.96);
  padding: 20px;
}

.lightbox__img {
  max-width: 100%;
  max-height: 85vh;
  object-fit: contain;
}

.lightbox__close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: white;
  cursor: pointer;
}

.lightbox__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: white;
  font-size: 28px;
  cursor: pointer;
}

.lightbox__nav--prev {
  left: 12px;
}

.lightbox__nav--next {
  right: 12px;
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
