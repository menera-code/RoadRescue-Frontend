
import { ref, computed } from 'vue'

import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage'

import { storage } from '@/firebase'

const MIME_TYPES = {
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  webm: 'video/webm',
  ogv: 'video/ogg',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  '3gp': 'video/3gpp',

  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
}

function extFromName(name) {
  const parts = (name || '').split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

function getContentType(file) {
  const extension = extFromName(file.name)
  const extensionMime = MIME_TYPES[extension]
  const browserType = (file.type || '').toLowerCase()

  if (
    browserType &&
    browserType !== 'application/octet-stream'
  ) {
    return browserType
  }

  return extensionMime || 'application/octet-stream'
}

function uploadOne(file, path, onProgress) {
  return new Promise((resolve, reject) => {
    const fileRef = storageRef(storage, path)
    const contentType = getContentType(file)

    const metadata = {
      contentType,
      cacheControl: 'public, max-age=3600',
      customMetadata: {
        originalFileName: file.name || 'unknown',
        originalMimeType: file.type || 'unknown',
        uploadedAt: new Date().toISOString(),
      },
    }

    console.log('[MediaUpload] Uploading:', {
      name: file.name,
      type: contentType,
      size: file.size,
      path,
    })

    const task = uploadBytesResumable(
      fileRef,
      file,
      metadata
    )

    task.on(
      'state_changed',

      (snapshot) => {
        onProgress?.(
          snapshot.bytesTransferred,
          snapshot.totalBytes
        )
      },

      (error) => {
        console.error('[MediaUpload] Upload failed:', error)
        reject(error)
      },

      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)

          console.log('[MediaUpload] Firebase URL obtained:', url)

          resolve(url)
        } catch (error) {
          console.error(
            '[MediaUpload] Could not get download URL:',
            error
          )
          reject(error)
        }
      }
    )
  })
}

export function useMediaUpload() {
  const uploads = ref({})
  const uploading = ref(false)
  const error = ref('')

  const totalBytes = computed(() =>
    Object.values(uploads.value).reduce(
      (sum, upload) => sum + (upload.total || 0),
      0
    )
  )

  const loadedBytes = computed(() =>
    Object.values(uploads.value).reduce(
      (sum, upload) => sum + (upload.loaded || 0),
      0
    )
  )

  const progress = computed(() => {
    if (!totalBytes.value) return 0

    return Math.round(
      (loadedBytes.value / totalBytes.value) * 100
    )
  })

  function setFile(label, patch) {
    uploads.value = {
      ...uploads.value,
      [label]: {
        ...(uploads.value[label] || {}),
        ...patch,
      },
    }
  }

  function reset() {
    uploads.value = {}
    uploading.value = false
    error.value = ''
  }

  async function uploadAll(
    incidentId,
    photos = [],
    video = null
  ) {
    if (!incidentId) {
      throw new Error('Incident ID is required.')
    }

    reset()
    uploading.value = true

    const photoUrls = []
    let videoUrl = null

    try {
      // Upload photos.
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i]
        const label = `photo-${i + 1}`

        setFile(label, {
          loaded: 0,
          total: file.size,
          status: 'uploading',
        })

        const extension = extFromName(file.name) || 'jpg'

        const path =
          `incidents/${incidentId}/photo-${i + 1}.${extension}`

        const url = await uploadOne(
          file,
          path,
          (loaded, total) => {
            setFile(label, { loaded, total })
          }
        )

        setFile(label, {
          status: 'done',
          url,
        })

        photoUrls.push(url)
      }

      // Upload original video without renaming or conversion.
      if (video) {
        const label = 'video'

        setFile(label, {
          loaded: 0,
          total: video.size,
          status: 'uploading',
        })

        const extension = extFromName(video.name) || 'mp4'

        const path =
          `incidents/${incidentId}/video.${extension}`

        videoUrl = await uploadOne(
          video,
          path,
          (loaded, total) => {
            setFile(label, { loaded, total })
          }
        )

        setFile(label, {
          status: 'done',
          url: videoUrl,
        })
      }

      console.log('[MediaUpload] Completed:', {
        incidentId,
        photoUrls,
        videoUrl,
      })

      return {
        photoUrls,
        videoUrl,
      }

    } catch (uploadError) {
      console.error(
        '[useMediaUpload] Upload failed:',
        uploadError
      )

      error.value =
        uploadError?.message || 'Upload failed.'

      throw uploadError

    } finally {
      uploading.value = false
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
