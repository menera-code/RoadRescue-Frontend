<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted } from 'vue'

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
let loadTimeout = null

// Always preload auto to ensure data starts downloading immediately
const videoPreload = 'auto'

// Reset video state when URL changes
watch(
  () => props.videoUrl,
  async () => {
    resetVideoState()
    videoRetryKey.value++

    if (props.videoUrl) {
      videoLoading.value = true
      videoStatus.value = 'loading'
    }

    await nextTick()

    if (videoElement.value && props.videoUrl) {
      videoElement.value.load()
    }
  },
  { immediate: true }
)

function resetVideoState() {
  videoLoading.value = false
  videoError.value = false
  videoErrorMessage.value = ''
  videoErrorCode.value = null
  videoStatus.value = 'idle'
  clearTimeout(loadTimeout)
}

// A 15-second timeout prevents the video from buffering forever if the file is corrupt
function startLoadTimeout() {
  clearTimeout(loadTimeout)
  loadTimeout = setTimeout(() => {
    if (videoStatus.value === 'loading' || videoStatus.value === 'buffering') {
      console.warn('[RoadRescue Video] Timeout reached. File may be unsupported or corrupted.')
      videoLoading.value = false
      videoError.value = true
      videoStatus.value = 'error'
      videoErrorMessage.value = 'The video is taking too long to load. It may be in an unsupported format (like HEVC/MOV) or corrupted.'
    }
  }, 15000)
}

// VIDEO EVENTS
function onVideoLoadStart() {
  videoLoading.value = true
  videoError.value = false
  videoStatus.value = 'loading'
  startLoadTimeout()
}

function onVideoLoadedMetadata() {
  videoStatus.value = 'ready'
}

function onVideoCanPlay() {
  clearTimeout(loadTimeout)
  videoLoading.value = false
  videoStatus.value = 'ready'
}

function onVideoWaiting() {
  videoLoading.value = true
  videoStatus.value = 'buffering'
  // Restart timeout on buffering
  startLoadTimeout()
}

function onVideoPlaying() {
  clearTimeout(loadTimeout)
  videoLoading.value = false
  videoStatus.value = 'playing'
}

function onVideoError(event) {
  clearTimeout(loadTimeout)
  const mediaError = event.target?.error
  const code = mediaError?.code ?? null

  console.error('[RoadRescue Video] Playback error:', { code, message: mediaError?.message })

  videoLoading.value = false
  videoErrorCode.value = code
  videoStatus.value = 'error'
  videoError.value = true

  if (code === 3) {
    videoErrorMessage.value = 'The browser could not decode this video. It is likely an iPhone HEVC/MOV file which is not supported on this device.'
  } else if (code === 4) {
    videoErrorMessage.value = 'The video format is not supported by this browser.'
  } else {
    videoErrorMessage.value = 'A network or playback error occurred.'
  }
}

// FORCE PLAY
// If native controls are unclickable, clicking the video area triggers play()
async function togglePlay() {
  if (!videoElement.value || videoError.value) return
  
  if (videoElement.value.paused) {
    try {
      await videoElement.value.play()
    } catch (e) {
      console.warn('Force play failed:', e)
    }
  }
}

async function retryVideo() {
  resetVideoState()
  videoLoading.value = true
  videoStatus.value = 'loading'
  videoRetryKey.value++
  await nextTick()
  
  if (videoElement.value) {
    videoElement.value.load()
    // Try to play immediately after load
    setTimeout(() => togglePlay(), 500)
  }
}

// PHOTO LIGHTBOX
function openLightbox(index) { lightboxIndex.value = index }
function closeLightbox() { lightboxIndex.value = -1 }
function nextPhoto() {
  if (!props.photoUrls.length) return
  lightboxIndex.value = (lightboxIndex.value + 1) % props.photoUrls.length
}
function prevPhoto() {
  if (!props.photoUrls.length) return
  lightboxIndex.value = (lightboxIndex.value - 1 + props.photoUrls.length) % props.photoUrls.length
}

onBeforeUnmount(() => {
  clearTimeout(loadTimeout)
  if (videoElement.value) videoElement.value.pause()
})
</script>

<template>
  <div v-if="props.photoUrls.length || props.videoUrl" :class="['gallery', `gallery--${props.mode}`]">
    <!-- PHOTOS -->
    <div v-if="props.photoUrls.length" class="gallery__photos">
      <button
        v-for="(url, index) in props.photoUrls"
        :key="`${index}-${url}`"
        type="button"
        class="gallery__thumb"
        @click="openLightbox(index)"
      >
        <img :src="url" alt="Incident evidence" loading="lazy" />
      </button>
    </div>

    <!-- VIDEO -->
    <div v-if="props.videoUrl" class="gallery__video">
      <!-- FLOATING LOADING OVERLAY (Pointer events none so it doesn't block clicks) -->
      <div v-if="videoLoading && !videoError" class="video-loading">
        <span class="video-spinner"></span>
        <span>{{ videoStatus === 'buffering' ? 'Buffering...' : 'Loading...' }}</span>
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
        @click="togglePlay"
        @loadstart="onVideoLoadStart"
        @loadedmetadata="onVideoLoadedMetadata"
        @canplay="onVideoCanPlay"
        @waiting="onVideoWaiting"
        @playing="onVideoPlaying"
        @error="onVideoError"
      >
        Your browser does not support HTML5 video.
      </video>

      <!-- ERROR STATE -->
      <div v-if="videoError" class="video-error">
        <div class="video-error-icon">⚠️</div>
        <p class="video-error-title">Unable to play this video</p>
        <p class="video-error-text">{{ videoErrorMessage }}</p>
        
        <button type="button" class="video-retry" @click="retryVideo">
          ↻ Retry video
        </button>

        <a :href="props.videoUrl" target="_blank" rel="noopener noreferrer" class="video-open-original">
          Open video in browser ↗
        </a>
      </div>
    </div>
  </div>

  <!-- PHOTO LIGHTBOX (unchanged) -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isLightboxOpen" class="lightbox" @click.self="closeLightbox">
        <button class="lightbox__close" @click="closeLightbox">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
        </button>
        <button v-if="props.photoUrls.length > 1" class="lightbox__nav lightbox__nav--prev" @click.stop="prevPhoto">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="m15 18-6-6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
        </button>
        <img class="lightbox__img" :src="props.photoUrls[lightboxIndex]" @click.stop />
        <button v-if="props.photoUrls.length > 1" class="lightbox__nav lightbox__nav--next" @click.stop="nextPhoto">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* CSS remains mostly the same, except for the loading overlay */
.gallery { display: flex; flex-direction: column; gap: 10px; width: 100%; min-width: 0; }
.gallery__photos { display: flex; flex-wrap: wrap; gap: 8px; }
.gallery__thumb { flex-shrink: 0; width: 76px; height: 76px; padding: 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--bg-input); cursor: pointer; }
.gallery__thumb img { width: 100%; height: 100%; object-fit: cover; }
.gallery--compact .gallery__photos { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
.gallery--compact .gallery__thumb { width: 68px; height: 68px; }
.gallery--full .gallery__photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); }
.gallery--full .gallery__thumb { width: 100%; height: auto; aspect-ratio: 1; }

/* VIDEO */
.gallery__video { position: relative; width: 100%; min-width: 0; border-radius: 12px; overflow: hidden; background: #000; }
.gallery__player { display: block; width: 100%; height: auto; max-height: 320px; background: #000; object-fit: contain; border-radius: 12px; cursor: pointer; }
.gallery--full .gallery__player { max-height: 420px; }

/* FLOATING LOADING OVERLAY - Fixed to not block clicks */
.video-loading {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  border-radius: 20px;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  z-index: 10;
  pointer-events: none; /* CRUCIAL: Let clicks pass through to the video */
}
.video-spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: video-spin 0.8s linear infinite; }
@keyframes video-spin { to { transform: rotate(360deg); } }

/* ERROR UI */
.video-error { padding: 24px 16px; text-align: center; color: #fff; background: #171717; }
.video-error-icon { font-size: 1.7rem; }
.video-error-title { font-weight: 700; margin: 8px 0 4px; }
.video-error-text { font-size: 0.8rem; color: #d1d5db; line-height: 1.5; margin-bottom: 16px; }
.video-retry { display: block; margin: 0 auto 12px; padding: 10px 20px; border: none; border-radius: 8px; background: #2563eb; color: #fff; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.video-open-original { display: inline-block; color: #93c5fd; font-size: 0.875rem; font-weight: 600; text-decoration: underline; }
</style>
