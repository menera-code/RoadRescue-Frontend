// src/composables/useMediaUpload.js
//
// Uploads photos + video to Firebase Storage under incidents/{id}/.
// Tracks cumulative upload progress across all files.
//
// Usage:
//   const { uploads, progress, uploading, error, uploadAll, reset } = useMediaUpload()
//   const { photoUrls, videoUrl } = await uploadAll(incidentId, photos, video)

import { ref, computed } from 'vue'
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage'
import { storage } from '@/firebase'

function extFromName(name) {
  const parts = (name || '').split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : 'bin'
}

/**
 * Upload one file, reporting progress into a shared tracker.
 * Returns the download URL.
 */
function uploadOne(file, path, onProgress) {
  return new Promise((resolve, reject) => {
    const sRef = storageRef(storage, path)
    const task = uploadBytesResumable(sRef, file, {
      contentType: file.type || undefined,
    })

    task.on(
      'state_changed',
      (snap) => onProgress(snap.bytesTransferred, snap.totalBytes),
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          resolve(url)
        } catch (e) {
          reject(e)
        }
      }
    )
  })
}

export function useMediaUpload() {
  // Per-file progress: Map<label, { loaded, total, status }>
  const uploads = ref({})
  const uploading = ref(false)
  const error = ref('')

  const totalBytes = computed(() =>
    Object.values(uploads.value).reduce((sum, u) => sum + (u.total || 0), 0)
  )
  const loadedBytes = computed(() =>
    Object.values(uploads.value).reduce((sum, u) => sum + (u.loaded || 0), 0)
  )
  const progress = computed(() => {
    if (!totalBytes.value) return 0
    return Math.round((loadedBytes.value / totalBytes.value) * 100)
  })

  function setFile(label, patch) {
    uploads.value = {
      ...uploads.value,
      [label]: { ...(uploads.value[label] || {}), ...patch },
    }
  }

  function reset() {
    uploads.value = {}
    uploading.value = false
    error.value = ''
  }

  /**
   * Upload all media for an incident.
   *
   * @param {string} incidentId
   * @param {File[]} photos   - up to 3 image files
   * @param {File|null} video - optional video file
   * @returns {Promise<{ photoUrls: string[], videoUrl: string|null }>}
   */
  async function uploadAll(incidentId, photos = [], video = null) {
    reset()
    uploading.value = true

    const photoUrls = []
    let videoUrl = null

    try {
      // Photos — sequential so progress reflects real queueing
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i]
        const label = `photo-${i + 1}`
        setFile(label, { loaded: 0, total: file.size, status: 'uploading' })

        const ext = extFromName(file.name) || 'jpg'
        const path = `incidents/${incidentId}/photo-${i + 1}.${ext}`

        const url = await uploadOne(file, path, (loaded, total) => {
          setFile(label, { loaded, total })
        })

        setFile(label, { status: 'done', url })
        photoUrls.push(url)
      }

      // Video (single, optional)
      if (video) {
        const label = 'video'
        setFile(label, { loaded: 0, total: video.size, status: 'uploading' })

        const ext = extFromName(video.name) || 'mp4'
        const path = `incidents/${incidentId}/video.${ext}`

        videoUrl = await uploadOne(video, path, (loaded, total) => {
          setFile(label, { loaded, total })
        })

        setFile(label, { status: 'done', url: videoUrl })
      }

      uploading.value = false
      return { photoUrls, videoUrl }
    } catch (e) {
      console.error('[useMediaUpload] upload failed', e)
      error.value = e?.message || 'Upload failed.'
      uploading.value = false
      throw e
    }
  }

  return {
    uploads,
    progress,
    uploading,
    error,
    uploadAll,
    reset,
  }
}