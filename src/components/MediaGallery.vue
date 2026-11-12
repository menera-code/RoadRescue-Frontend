
<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'

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

const videoElement = ref(null)
const videoRetryKey = ref(0)
const videoError = ref(false)
const videoLoading = ref(false)
const videoErrorMessage = ref('')
const videoReady = ref(false)

const isLightboxOpen = computed(() => lightboxIndex.value >= 0)

const videoPreload = computed(() =>
  props.mode === 'compact' ? 'none' : 'metadata'
)

// Reset video state
function resetVideoState() {
  videoError.value = false
  videoErrorMessage.value = ''
  videoLoading.value = false
  videoReady.value = false
}

// Watch URL changes
watch(
  () => props.videoUrl,
  async () => {
    resetVideoState()
    videoRetryKey.value++

    await nextTick()

    if (props.mode === 'full' && videoElement.value) {
      videoLoading.value = true
      videoElement.value.load()
    }
  },
  { immediate: true }
)

// Watch display mode changes
watch(
  () => props.mode,
  async (newMode) => {
    resetVideoState()
    videoRetryKey.value++

    await nextTick()

    if (newMode === 'full' && videoElement.value) {
      videoLoading.value = true
      videoElement.value.load()
    }
  }
)

// PHOTO LIGHTBOX
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

// VIDEO EVENTS
function onVideoLoadStart() {
  videoLoading.value = true
  videoError.value = false
}

function onVideoLoaded() {
  videoLoading.value = false
  videoError.value = false
  videoReady.value = true
  videoErrorMessage.value = ''
}

function onVideoWaiting() {
  videoLoading.value = true
}

function onVideoPlaying() {
  videoLoading.value = false
  videoError.value = false
  videoReady.value = true
}

function onVideoCanPlay() {
  videoLoading.value = false
  videoReady.value = true
  videoError.value = false
  videoErrorMessage.value = ''
}

function onVideoError(event) {
  const video = event.target
  const mediaError = video?.error
  const code = mediaError?.code

  console.error('[MediaGallery] Video playback error:', {
    code,
    message: mediaError?.message,
    currentSrc: video?.currentSrc,
    networkState: video?.networkState,
    readyState: video?.readyState,
    duration: video?.duration,
    mode: props.mode,
    userAgent: navigator.userAgent,
    standalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true,
  })

  videoLoading.value = false

  // Code 1: Playback was aborted
  if (code === 1) {
    console.warn('[MediaGallery] Video loading was aborted.')
    return
  }

  videoError.value = true
  videoReady.value = false

  switch (code) {
    case 2:
      videoErrorMessage.value =
        'A network error interrupted the video. Check your connection and try again.'
      break

    case 3:
      videoErrorMessage.value =
        'The browser encountered a problem decoding this video.'
      break

    case 4:
      videoErrorMessage.value =
        'The browser cannot play this video source or format.'
      break

    default:
      videoErrorMessage.value =
        `Playback failed. Browser error code: ${code ?? 'unknown'}.`
  }
}

// RETRY VIDEO
async function retryVideo() {
  resetVideoState()
  videoLoading.value = true

  videoRetryKey.value++

  await nextTick()

  if (videoElement.value) {
    videoElement.value.load()
  }
}

// Open original Firebase video URL
function openOriginalVideo() {
  if (!props.videoUrl) return

  window.open(
    props.videoUrl,
    '_blank',
    'noopener,noreferrer'
  )
}

// Clean up
onBeforeUnmount(() => {
  if (videoElement.value) {
    videoElement.value.pause()
    videoElement.value.removeAttribute('src')
    videoElement.value.load()
  }
})
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
    <div
      v-if="props.videoUrl"
      class="gallery__video"
    >
      <div
        v-if="videoLoading && !videoError"
        class="video-loading"
      >
        <span class="video-spinner"></span>
        <span>Loading video...</span>
      </div>

      <video
        v-if="!videoError"
        :key="`${props.videoUrl}-${videoRetryKey}`"
        ref="videoElement"
        :src="props.videoUrl"
        :preload="videoPreload"
        controls
        playsinline
        webkit-playsinline
        x-webkit-airplay="allow"
        controlslist="nodownload"
        @loadstart="onVideoLoadStart"
        @loadedmetadata="onVideoLoaded"
        @canplay="onVideoCanPlay"
        @playing="onVideoPlaying"
        @waiting="onVideoWaiting"
        @error="onVideoError"
      >
        Your browser does not support HTML5 video.
      </video>

      <!-- ERROR STATE -->
      <div
        v-if="videoError"
        class="video-error"
      >
        <span class="video-error-icon">⚠️</span>

        <p class="video-error-title">
          Unable to play this video
        </p>

        <p class="video-error-text">
          {{ videoErrorMessage }}
        </p>

        <button
          type="button"
          class="video-retry"
          @click="retryVideo"
        >
          ↻ Retry video
        </button>

        <button
          type="button"
          class="video-open-original"
          @click="openOriginalVideo"
        >
          Open video directly
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
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
          >
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
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
          >
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
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
          >
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
  width: 100%;
  min-width: 0;
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

/* VIDEO */
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
  color: #d1d5db;
  line-height: 1.5;
  margin-bottom: 16px;
}

.video-retry {
  display: block;
  margin: 0 auto;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: white;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.video-open-original {
  display: block;
  margin: 12px auto 0;
  padding: 6px;
  border: none;
  background: transparent;
  color: #93c5fd;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}

/* LIGHTBOX */
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
  user-select: none;
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
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: white;
  cursor: pointer;
}

.lightbox__nav--prev {
  left: 12px;
}

.lightbox__nav--next {
  right: 12px;
}

.lightbox__counter {
  position: absolute;
  bottom: 20px;
  color: white;
  font-size: 0.85rem;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 480px) {
  .gallery__video video {
    max-height: 260px;
  }

  .gallery--full .gallery__video video {
    max-height: 320px;
  }
}
</style>
