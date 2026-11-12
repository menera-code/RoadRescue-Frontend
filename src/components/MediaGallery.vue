
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

// PHOTO STATE
const lightboxIndex = ref(-1)

const isLightboxOpen = computed(() => lightboxIndex.value >= 0)

// VIDEO STATE
const videoElement = ref(null)
const videoRetryKey = ref(0)
const videoLoading = ref(false)
const videoError = ref(false)
const videoErrorMessage = ref('')
const videoErrorCode = ref(null)
const videoStatus = ref('idle')

const videoPreload = computed(() => {
  return props.mode === 'compact' ? 'none' : 'metadata'
})

// Reset video state when URL changes
watch(
  () => props.videoUrl,
  async () => {
    resetVideoState()

    videoRetryKey.value++

    if (props.videoUrl && props.mode === 'full') {
      videoLoading.value = true
      videoStatus.value = 'loading'
    }

    await nextTick()

    // Intentionally do not call video.load().
    // Let the browser initialize the newly rendered video.
  },
  { immediate: true }
)

// Reset when display mode changes
watch(
  () => props.mode,
  async (newMode) => {
    resetVideoState()

    videoRetryKey.value++

    if (newMode === 'full' && props.videoUrl) {
      videoLoading.value = true
      videoStatus.value = 'loading'
    }

    await nextTick()
  }
)

function resetVideoState() {
  videoLoading.value = false
  videoError.value = false
  videoErrorMessage.value = ''
  videoErrorCode.value = null
  videoStatus.value = 'idle'
}

// VIDEO EVENTS

function onVideoLoadStart() {
  videoLoading.value = true
  videoError.value = false
  videoStatus.value = 'loading'

  console.log('[RoadRescue Video] Loading started')
}

function onVideoLoadedMetadata(event) {
  const video = event.target

  console.log('[RoadRescue Video] Metadata loaded:', {
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    readyState: video.readyState,
    currentSrc: video.currentSrc,
  })

  videoLoading.value = false
  videoError.value = false
  videoStatus.value = 'ready'
}

function onVideoLoadedData() {
  videoLoading.value = false
  videoError.value = false
  videoStatus.value = 'ready'
}

function onVideoCanPlay() {
  videoLoading.value = false
  videoError.value = false
  videoErrorMessage.value = ''
  videoErrorCode.value = null
  videoStatus.value = 'ready'

  console.log('[RoadRescue Video] Can play')
}

function onVideoWaiting() {
  videoLoading.value = true
  videoStatus.value = 'buffering'
}

function onVideoPlaying() {
  videoLoading.value = false
  videoError.value = false
  videoErrorMessage.value = ''
  videoErrorCode.value = null
  videoStatus.value = 'playing'

  console.log('[RoadRescue Video] Playback started')
}

function onVideoPause() {
  if (videoElement.value?.ended) return

  if (!videoError.value) {
    videoStatus.value = 'paused'
  }
}

function onVideoEnded() {
  videoLoading.value = false
  videoStatus.value = 'ended'
}

// Capture actual browser errors
function onVideoError(event) {
  const video = event.target
  const mediaError = video?.error
  const code = mediaError?.code ?? null

  const details = {
    code,
    message: mediaError?.message,
    currentSrc: video?.currentSrc,
    networkState: video?.networkState,
    readyState: video?.readyState,
    duration: video?.duration,
    videoWidth: video?.videoWidth,
    videoHeight: video?.videoHeight,
    mode: props.mode,
    online: navigator.onLine,
    userAgent: navigator.userAgent,
    standalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true,
  }

  console.error('[RoadRescue Video] Playback error:', details)

  videoLoading.value = false
  videoErrorCode.value = code
  videoStatus.value = 'error'

  // MEDIA_ERR_ABORTED
  // Do not show a permanent error for an aborted request.
  if (code === 1) {
    console.warn('[RoadRescue Video] Request was aborted')
    videoStatus.value = 'aborted'
    return
  }

  videoError.value = true

  switch (code) {
    case 2:
      videoErrorMessage.value =
        'A network error interrupted the video. Check your internet connection.'

      break

    case 3:
      videoErrorMessage.value =
        'The browser could not decode the video.'

      break

    case 4:
      videoErrorMessage.value =
        'The video format or source is not supported by this browser.'

      break

    default:
      videoErrorMessage.value =
        'An unexpected playback error occurred.'
  }
}

// RETRY
async function retryVideo() {
  resetVideoState()

  videoLoading.value = true
  videoStatus.value = 'loading'

  // Recreate the video element instead of forcing load().
  videoRetryKey.value++

  await nextTick()

  console.log('[RoadRescue Video] Retry requested')
}

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

// DEVICE INFORMATION FOR DEBUGGING
const isStandalone = computed(() => {
  return (
    typeof window !== 'undefined' &&
    (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    )
  )
})

// CLEANUP
onBeforeUnmount(() => {
  if (videoElement.value) {
    videoElement.value.pause()
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
        :aria-label="`Open photo ${index + 1}`"
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

      <!-- LOADING -->
      <div
        v-if="videoLoading && !videoError"
        class="video-loading"
      >
        <span class="video-spinner"></span>
        <span>
          {{ videoStatus === 'buffering'
            ? 'Buffering video...'
            : 'Loading video...' }}
        </span>
      </div>

      <!-- NATIVE VIDEO PLAYER -->
      <video
        v-if="!videoError"
        :key="`${props.videoUrl}-${videoRetryKey}`"
        ref="videoElement"
        class="gallery__player"
        :src="props.videoUrl"
        :preload="videoPreload"
        controls
        playsinline
        webkit-playsinline
        x-webkit-airplay="allow"
        @loadstart="onVideoLoadStart"
        @loadedmetadata="onVideoLoadedMetadata"
        @loadeddata="onVideoLoadedData"
        @canplay="onVideoCanPlay"
        @playing="onVideoPlaying"
        @waiting="onVideoWaiting"
        @pause="onVideoPause"
        @ended="onVideoEnded"
        @error="onVideoError"
      >
        Your browser does not support HTML5 video.
      </video>

      <!-- ERROR STATE -->
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
          {{ videoErrorMessage }}
        </p>

        <p class="video-error-code">
          Error code: {{ videoErrorCode ?? 'Unknown' }}
        </p>

        <!-- RETRY -->
        <button
          type="button"
          class="video-retry"
          @click="retryVideo"
        >
          ↻ Retry video
        </button>

        <!-- OPEN ORIGINAL URL -->
        <a
          :href="props.videoUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="video-open-original"
        >
          Open video in browser ↗
        </a>
      </div>

      <!-- PLAYER INFORMATION -->
      <div
        v-if="props.mode === 'full'"
        class="video-debug-info"
      >
        <span>
          Playback: {{ videoStatus }}
        </span>

        <span v-if="isStandalone">
          iPhone standalone app
        </span>
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

        <!-- CLOSE -->
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

        <!-- PREVIOUS -->
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

        <!-- IMAGE -->
        <img
          class="lightbox__img"
          :src="props.photoUrls[lightboxIndex]"
          alt="Incident evidence fullscreen"
          @click.stop
        />

        <!-- NEXT -->
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

        <!-- COUNTER -->
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

/* VIDEO CONTAINER */
.gallery__video {
  position: relative;
  width: 100%;
  min-width: 0;
  border-radius: 12px;
  overflow: hidden;
  background: #000;
}

/* VIDEO PLAYER */
.gallery__player {
  display: block;
  width: 100%;
  height: auto;
  max-height: 320px;
  background: #000;
  object-fit: contain;
  border-radius: 12px;
}

.gallery--full .gallery__player {
  max-height: 420px;
}

/* LOADING */
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
  border: 2px solid rgba(255,255,255,0.25);
  border-top-color: #fff;
  border-radius: 50%;
  animation: video-spin 0.8s linear infinite;
}

@keyframes video-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ERROR */
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
  margin-bottom: 8px;
}

.video-error-code {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-bottom: 16px;
}

/* RETRY */
.video-retry {
  display: block;
  margin: 0 auto;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

/* ORIGINAL VIDEO LINK */
.video-open-original {
  display: inline-block;
  margin: 12px auto 0;
  padding: 8px 12px;
  color: #93c5fd;
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}

/* DEBUG STATUS */
.video-debug-info {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  padding: 5px 2px;
  color: var(--text-muted, #888);
  font-size: 0.7rem;
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

/* TRANSITION */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* MOBILE */
@media (max-width: 480px) {
  .gallery__player {
    max-height: 260px;
  }

  .gallery--full .gallery__player {
    max-height: 320px;
  }
}
</style>
