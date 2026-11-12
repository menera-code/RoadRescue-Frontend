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
  },
})

// PHOTO STATE
const lightboxIndex = ref(-1)
const isLightboxOpen = computed(() => lightboxIndex.value >= 0)

// VIDEO STATE
const videoError = ref(false)
const videoRetryKey = ref(0)

// Reset error when URL changes
watch(
  () => props.videoUrl,
  () => {
    videoError.value = false
    videoRetryKey.value++
  }
)

function onVideoError(event) {
  console.error('[RoadRescue Video] Error:', event.target?.error)
  videoError.value = true
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
  // No custom video cleanup needed, browser handles it
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
      
      <!-- NATIVE VIDEO PLAYER (No custom overlays blocking clicks) -->
      <video
        v-if="!videoError"
        :key="`${props.videoUrl}-${videoRetryKey}`"
        class="gallery__player"
        :src="props.videoUrl"
        controls
        playsinline
        webkit-playsinline
        preload="metadata"
        @error="onVideoError"
      >
        Your browser does not support HTML5 video.
      </video>

      <!-- ERROR STATE (If the browser rejects the file) -->
      <div v-if="videoError" class="video-error">
        <div class="video-error-icon">⚠️</div>
        <p class="video-error-title">Unable to play video in app</p>
        
        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 16px;">
          <button 
            class="video-retry" 
            style="margin: 0;" 
            @click="videoError = false; videoRetryKey++"
          >
            ↻ Retry
          </button>
          
          <!-- Fallback: Open in native iOS/Android player -->
          <a 
            :href="props.videoUrl" 
            target="_blank" 
            rel="noopener noreferrer" 
            class="video-open-original"
            style="padding: 10px 20px; border-radius: 8px; background: #3b82f6; color: #fff; text-decoration: none; font-weight: 600; font-size: 0.85rem;"
          >
            Open in Browser ↗
          </a>
        </div>
      </div>

    </div>
  </div>

  <!-- PHOTO LIGHTBOX -->
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
.gallery { display: flex; flex-direction: column; gap: 10px; width: 100%; min-width: 0; }
.gallery__photos { display: flex; flex-wrap: wrap; gap: 8px; }
.gallery__thumb { flex-shrink: 0; width: 76px; height: 76px; padding: 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--bg-input); cursor: pointer; }
.gallery__thumb img { width: 100%; height: 100%; object-fit: cover; }

/* COMPACT MODE */
.gallery--compact .gallery__photos { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
.gallery--compact .gallery__thumb { width: 68px; height: 68px; }

/* FULL MODE */
.gallery--full .gallery__photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); }
.gallery--full .gallery__thumb { width: 100%; height: auto; aspect-ratio: 1; }

/* VIDEO */
.gallery__video { position: relative; width: 100%; min-width: 0; border-radius: 12px; overflow: hidden; background: #000; }
.gallery__player { display: block; width: 100%; height: auto; max-height: 320px; background: #000; object-fit: contain; border-radius: 12px; }
.gallery--full .gallery__player { max-height: 420px; }

/* ERROR UI */
.video-error { padding: 24px 16px; text-align: center; color: #fff; background: #171717; }
.video-error-icon { font-size: 1.7rem; }
.video-error-title { font-weight: 700; margin: 8px 0 4px; }
.video-retry { padding: 10px 20px; border: none; border-radius: 8px; background: #4b5563; color: #fff; font-size: 0.85rem; font-weight: 600; cursor: pointer; }

/* LIGHTBOX */
.lightbox { position: fixed; inset: 0; z-index: 99999; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.96); padding: 20px; }
.lightbox__img { max-width: 100%; max-height: 85vh; object-fit: contain; }
.lightbox__close { position: absolute; top: 20px; right: 20px; width: 42px; height: 42px; border: none; border-radius: 50%; background: rgba(255, 255, 255, 0.15); color: white; cursor: pointer; display: grid; place-items: center;}
.lightbox__nav { position: absolute; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: none; border-radius: 50%; background: rgba(255, 255, 255, 0.15); color: white; cursor: pointer; }
.lightbox__nav--prev { left: 12px; }
.lightbox__nav--next { right: 12px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
