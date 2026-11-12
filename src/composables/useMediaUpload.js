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
// Never assume every video is an MP4.
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

  return parts.length > 1
    ? parts.pop().toLowerCase()
    : ''
}

/**
 * Resolve the MIME type to store on the Firebase object.
 *
 * IMPORTANT: we trust the file extension first for known formats.
 * iOS Safari frequently reports the WRONG file.type for videos
 * (a .mov recorded on iPhone is often reported as video/mp4, or
 * as an empty string). If we trust file.type, the object gets
 * stored with a Content-Type that doesn't match the real
 * container, and browsers reject it during playback.
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

  if (
    browserType &&
    browserType !== 'application/octet-stream'
  ) {
    return browserType
  }

  return ''
}

/**
 * iOS records .mov files as HEVC by default, which Chrome/Android
 * cannot play. Warn during upload so this is visible in logs.
 */
function warnIfLikelyUnplayable(file, kind) {
  if (kind !== 'video') return

  const ext = extFromName(file.name)

  if (ext === 'mov' || ext === 'hevc') {
    console.warn(
      `[MediaUpload] Video "${file.name}" is a ${ext.toUpperCase()} file. ` +
      `iOS records .mov as HEVC by default — Chrome/Android cannot play it. ` +
      `Transcode to H.264 MP4 for universal compatibility.`
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

    // Only set contentType when we have a meaningful MIME type.
    if (contentType) {
      metadata.contentType = contentType
    }

    console.log('[MediaUpload] Uploading file:', {
      name: file.name,
      size: file.size,
      browserMimeType: file.type,
      storageMimeType: contentType || 'not explicitly specified',
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
        onProgress(
          snapshot.bytesTransferred,
          snapshot.totalBytes
        )
      },

      (error) => {
        console.error(
          '[MediaUpload] Upload failed:',
          error
        )

        reject(error)
      },

      async () => {
        try {
          // Confirm the stored Content-Type matches what we intended.
          const storedMetadata = task.snapshot.metadata || {}

          console.log(
            '[MediaUpload] Upload completed:',
            path,
            '| stored Content-Type:',
            storedMetadata.contentType || '(none — relies on extension)'
          )

          if (
            contentType &&
            storedMetadata.contentType &&
            storedMetadata.contentType !== contentType
          ) {
            console.warn(
              '[MediaUpload] Stored Content-Type differs from resolved type. ' +
              `Expected "${contentType}", got "${storedMetadata.contentType}".`
            )
          }

          const url = await getDownloadURL(
            task.snapshot.ref
          )

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

  /**
   * Upload all incident media.
   *
   * @param {string} incidentId
   * @param {File[]} photos
   * @param {File|null} video
   */
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
      // Upload photos sequentially.
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i]

        const label = `photo-${i + 1}`

        setFile(label, {
          loaded: 0,
          total: file.size,
          status: 'uploading',
        })

        const extension =
          extFromName(file.name) || 'jpg'

        const path =
          `incidents/${incidentId}/photo-${i + 1}.${extension}`

        const url = await uploadOne(
          file,
          path,
          (loaded, total) => {
            setFile(label, {
              loaded,
              total,
            })
          }
        )

        setFile(label, {
          status: 'done',
          url,
        })

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

        const extension =
          extFromName(video.name) || 'bin'

        const path =
          `incidents/${incidentId}/video.${extension}`

        videoUrl = await uploadOne(
          video,
          path,
          (loaded, total) => {
            setFile(label, {
              loaded,
              total,
            })
          }
        )

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
      console.error(
        '[useMediaUpload] Upload failed:',
        uploadError
      )

      error.value =
        uploadError?.message || 'Upload failed.'

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
