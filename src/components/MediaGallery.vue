<script setup>
import { ref, computed, watch, nextTick } from 'vue'

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

const videoElement = ref(null)
const videoError = ref('')
const videoLoading = ref(false)
const videoReady = ref(false)

const photos = computed(() => (props.photoUrls || []).filter(Boolean))
const hasVideo = computed(() =>
  typeof props.videoUrl === 'string' && props.videoUrl.trim().length > 0
)

function resetVideoState() {
  videoError.value = ''
  videoReady.value = false
  videoLoading.value = hasVideo.value
}

function onVideoLoadStart() {
  videoLoading.value = true
  videoError.value = ''
}

function onVideoMetadata() {
  videoReady.value = true
  videoLoading.value = false
  videoError.value = ''
}

function onVideoCanPlay() {
  videoReady.value = true
  videoLoading.value = false
  videoError.value = ''
}

function onVideoError(event) {
  videoLoading.value = false
  videoReady.value = false

  const video = event?.target
  const errorCode = video?.error?.code

  console.error('[MediaGallery] Video playback error:', {
    code: errorCode,
    message: video?.error?.message,
    url: props.videoUrl,
    networkState: video?.networkState,
    readyState: video?.readyState,
  })

  switch (errorCode) {
    case 1:
      videoError.value = 'Video loading was interrupted. Please try again.'
      break
    case 2:
      videoError.value = 'A network error occurred while loading this video.'
      break
    case 3:
      videoError.value = 'Safari could not decode this video. It may use an unsupported video or audio codec.'
      break
    case 4:
      videoError.value = 'This video format or source is not supported by Safari.'
      break
    default:
      videoError.value = 'Unable to play this video. Check the video format and Firebase Storage URL.'
  }
}

async function retryVideo() {
  videoError.value = ''
  videoLoading.value = true
  videoReady.value = false

  await nextTick()
  const video = videoElement.value
  if (!video) return

  try {
    video.pause()
    video.load()
  } catch (error) {
    console.error('[MediaGallery] Retry failed:', error)
    videoLoading.value = false
  }
}

watch(
  () => props.videoUrl,
  async () => {
    resetVideoState()
    await nextTick()
    if (videoElement.value && hasVideo.value) {
      videoElement.value.load()
    }
  },
  { immediate: true }
)
</script>

<template>
  <section class="media-gallery" :class="`media-gallery--${mode}`">
    <div v-if="photos.length" class="media-section">
      <h3 class="media-heading">
        <span>📷</span>
        Incident Photos
      </h3>

      <div class="photo-grid">
        <a
          v-for="(photo, index) in photos"
          :key="`${photo}-${index}`"
          :href="photo"
          target="_blank"
          rel="noopener noreferrer"
          class="photo-item"
        >
          <img
            :src="photo"
            :alt="`Incident photo ${index + 1}`"
            loading="lazy"
          />
          <span class="photo-open">View photo ↗</span>
        </a>
      </div>
    </div>

    <div v-if="hasVideo" class="media-section">
      <h3 class="media-heading">
        <span>🎥</span>
        Incident Video
      </h3>

      <div class="video-wrapper">
        <video
          ref="videoElement"
          :key="videoUrl"
          class="incident-video"
          :src="videoUrl"
          controls
          playsinline
          webkit-playsinline
          preload="metadata"
          controlslist="nodownload"
          @loadstart="onVideoLoadStart"
          @loadedmetadata="onVideoMetadata"
          @canplay="onVideoCanPlay"
          @error="onVideoError"
        >
          Your browser does not support HTML5 video.
        </video>

        <div
          v-if="videoLoading && !videoReady && !videoError"
          class="video-status"
        >
          <span class="loading-spinner"></span>
          Loading video...
        </div>
      </div>

      <div v-if="videoError" class="video-error" role="alert">
        <strong>Video playback failed</strong>
        <p>{{ videoError }}</p>
        <button type="button" class="retry-button" @click="retryVideo">
          Retry video
        </button>
      </div>

      <a
        :href="videoUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="original-video-link"
      >
        Open original video in browser ↗
      </a>
    </div>

    <div v-if="!photos.length && !hasVideo" class="empty-media">
      <span>📁</span>
      <p>No photos or videos attached to this incident.</p>
    </div>
  </section>
</template>

<style scoped>
.media-gallery {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.media-section {
  width: 100%;
  min-width: 0;
}

.media-heading {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 12px;
  color: #1f2937;
  font-size: 15px;
  font-weight: 700;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
}

.photo-item {
  position: relative;
  display: block;
  overflow: hidden;
  border-radius: 10px;
  background: #f3f4f6;
  aspect-ratio: 4 / 3;
}

.photo-item img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-open {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 7px;
  color: white;
  background: rgba(0, 0, 0, 0.58);
  font-size: 11px;
  text-align: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.photo-item:hover .photo-open {
  opacity: 1;
}

.video-wrapper {
  position: relative;
  width: 100%;
  overflow: hidden;
  background: #000;
  border-radius: 12px;
  min-height: 180px;
}

.incident-video {
  display: block;
  width: 100%;
  height: auto;
  max-height: 520px;
  min-height: 180px;
  background: #000;
  object-fit: contain;
  border-radius: 12px;
  -webkit-appearance: none;
}

.video-status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: white;
  background: rgba(0, 0, 0, 0.65);
  font-size: 13px;
  pointer-events: none;
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.video-error {
  margin-top: 12px;
  padding: 13px;
  border: 1px solid #fecaca;
  border-radius: 9px;
  background: #fef2f2;
  color: #991b1b;
  font-size: 13px;
}

.video-error p {
  margin: 6px 0 10px;
  line-height: 1.5;
}

.retry-button {
  padding: 8px 13px;
  border: none;
  border-radius: 7px;
  background: #b91c1c;
  color: white;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.original-video-link {
  display: inline-block;
  margin-top: 10px;
  color: #2563eb;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.original-video-link:hover {
  text-decoration: underline;
}

.empty-media {
  padding: 25px;
  text-align: center;
  color: #6b7280;
  background: #f9fafb;
  border: 1px dashed #d1d5db;
  border-radius: 10px;
}

.empty-media span { font-size: 26px; }
.empty-media p { margin: 8px 0 0; font-size: 13px; }

@media (max-width: 600px) {
  .photo-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .incident-video { max-height: 350px; }
  .video-wrapper { border-radius: 8px; }
}
</style>
