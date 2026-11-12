// src/composables/useMediaUpload.js
//
// Uploads photos and videos to Firebase Storage.
// Storage structure: incidents/{incidentId}/
//
// Returns:
// {
//   photoUrls: string[],
//   videoUrl: string | null
// }

import { ref, computed } from 'vue'

import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage'

import { storage } from '@/firebase'

// MIME type fallbacks based on file extension.
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

/**
 * Resolve the MIME type to store on the Firebase object.
 */
function getContentType(file) {
  const extension = extFromName(file.name)
  const extensionMime = MIME_TYPES[extension]
  const browserType = (file.type || '').toLowerCase()

  if (extensionMime) {
    if (
      browserType &&
      browserType !== extensionMime &&
      browserType !== 'application/octet-stream'
    ) {
      console.warn(
        `[MediaUpload] MIME mismatch for "${file.name}": ` +
        `extension implies "${extensionMime}", browser reports "${browserType}". ` +
        `Using extension-derived type.`
      )
    }
    return extensionMime
  }

  if (browserType && browserType !== 'application/octet-stream') {
    return browserType
  }

  return ''
}

function warnIfLikelyUnplayable(file, kind) {
  if (kind !== 'video') return
  const ext = extFromName(file.name)
  if (ext === 'mov' || ext === 'hevc') {
    console.warn(
      `[MediaUpload] Video "${file.name}" is a ${ext.toUpperCase()} file. ` +
      `Applying Fix 1: Forcing upload as .mp4 for iOS compatibility.`
    )
  }
}

/**
 * Upload one file to Firebase Storage.
 */
function uploadOne(file, path, onProgress) {
  return new Promise((resolve, reject) => {
    const fileRef = storageRef(storage, path)
    const contentType = getContentType(file)

    const metadata = {
      cacheControl: 'public, max-age=3600',
      customMetadata: {
        originalFileName: file.name || 'unknown',
        uploadedAt: new Date().toISOString(),
        originalMimeType: file.type || 'unknown',
        resolvedMimeType: contentType || 'unknown',
      },
    }

    if (contentType) {
      metadata.contentType = contentType
    }

    console.log('[MediaUpload] Uploading file:', {
      name: file.name,
      size: file.size,
      storageMimeType: contentType || 'not explicitly specified',
      path,
    })

    const task = uploadBytesResumable(fileRef, file, metadata)

    task.on(
      'state_changed',
      (snapshot) => {
        onProgress(snapshot.bytesTransferred, snapshot.totalBytes)
      },
      (error) => {
        console.error('[MediaUpload] Upload failed:', error)
        reject(error)
      },
      async () => {
        try {
          const storedMetadata = task.snapshot.metadata || {}
          console.log(
            '[MediaUpload] Upload completed:',
            path,
            '| stored Content-Type:',
            storedMetadata.contentType || '(none)'
          )

          const url = await getDownloadURL(task.snapshot.ref)
          resolve(url)
        } catch (error) {
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
    return Math.round((loadedBytes.value / totalBytes.value) * 100)
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

  async function uploadAll(incidentId, photos = [], video = null) {
    if (!incidentId) {
      throw new Error('Incident ID is required.')
    }

    reset()
    uploading.value = true

    const photoUrls = []
    let videoUrl = null

    try {
      // Upload photos sequentially.
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i]
        const label = `photo-${i + 1}`

        setFile(label, {
          loaded: 0,
          total: file.size,
          status: 'uploading',
        })

        const extension = extFromName(file.name) || 'jpg'
        const path = `incidents/${incidentId}/photo-${i + 1}.${extension}`

        const url = await uploadOne(file, path, (loaded, total) => {
          setFile(label, { loaded, total })
        })

        setFile(label, { status: 'done', url })
        photoUrls.push(url)
      }

      // Upload optional video.
      if (video) {
        warnIfLikelyUnplayable(video, 'video')

        const label = 'video'

        setFile(label, {
          loaded: 0,
          total: video.size,
          status: 'uploading',
        })

        // -----------------------------------------------------------------
        // FIX 1: FORCE .MP4 EXTENSION FOR IOS COMPATIBILITY
        // We create a new File object that pretends to be an MP4.
        // This tricks iOS Safari into playing it natively over the network.
        // -----------------------------------------------------------------
        const forcedMp4File = new File([video], `video.mp4`, {
          type: 'video/mp4',
          lastModified: Date.now()
        })

        const path = `incidents/${incidentId}/video.mp4`

        videoUrl = await uploadOne(forcedMp4File, path, (loaded, total) => {
          setFile(label, { loaded, total })
        })

        setFile(label, {
          status: 'done',
          url: videoUrl,
        })
      }

      uploading.value = false

      return {
        photoUrls,
        videoUrl,
      }
    } catch (uploadError) {
      console.error('[useMediaUpload] Upload failed:', uploadError)
      error.value = uploadError?.message || 'Upload failed.'
      uploading.value = false
      throw uploadError
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
