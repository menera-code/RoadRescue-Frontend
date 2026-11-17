
import { ref, computed } from 'vue'

import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage'

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

import { storage } from '@/firebase'

// =====================================================
// VIDEO CONVERTER CONFIGURATION
// =====================================================

const FFmpegInstance = new FFmpeg()

const FFMPEG_BASE_URL =
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd'

let ffmpegLoading = null
let ffmpegReady = false

async function loadFFmpeg() {
  if (ffmpegReady) return

  if (ffmpegLoading) {
    return ffmpegLoading
  }

  ffmpegLoading = (async () => {
    console.log('[VideoConverter] Loading FFmpeg...')

    await FFmpegInstance.load({
      coreURL: await toBlobURL(
        `${FFMPEG_BASE_URL}/ffmpeg-core.js`,
        'text/javascript'
      ),

      wasmURL: await toBlobURL(
        `${FFMPEG_BASE_URL}/ffmpeg-core.wasm`,
        'application/wasm'
      ),
    })

    ffmpegReady = true

    console.log('[VideoConverter] FFmpeg loaded successfully.')
  })()

  try {
    await ffmpegLoading
  } catch (error) {
    ffmpegLoading = null
    ffmpegReady = false
    throw error
  }
}

// =====================================================
// AUTOMATIC VIDEO CONVERSION
// =====================================================

async function convertVideoToMp4(originalFile) {
  console.log('[VideoConverter] Starting conversion:', {
    name: originalFile.name,
    type: originalFile.type,
    size: originalFile.size,
  })

  await loadFFmpeg()

  const inputExtension =
    originalFile.name.split('.').pop()?.toLowerCase() || 'mov'

  const inputName = `input.${inputExtension}`
  const outputName = 'converted.mp4'

  try {
    await FFmpegInstance.writeFile(
      inputName,
      await fetchFile(originalFile)
    )

    await FFmpegInstance.exec([
      '-i',
      inputName,

      '-c:v',
      'libx264',

      '-preset',
      'ultrafast',

      '-crf',
      '28',

      '-vf',
      "scale='min(1280,iw)':-2",

      '-pix_fmt',
      'yuv420p',

      '-c:a',
      'aac',

      '-b:a',
      '128k',

      '-movflags',
      '+faststart',

      '-y',
      outputName,
    ])

    const convertedData =
      await FFmpegInstance.readFile(outputName)

    if (!convertedData || convertedData.length === 0) {
      throw new Error('Video conversion produced an empty file.')
    }

    const convertedBlob = new Blob(
      [convertedData.buffer],
      { type: 'video/mp4' }
    )

    const convertedFile = new File(
      [convertedBlob],
      `${originalFile.name.replace(/\.[^/.]+$/, '')}.mp4`,
      {
        type: 'video/mp4',
        lastModified: Date.now(),
      }
    )

    console.log('[VideoConverter] Conversion completed:', {
      originalSize: originalFile.size,
      convertedSize: convertedFile.size,
      convertedType: convertedFile.type,
    })

    return convertedFile

  } finally {
    try {
      await FFmpegInstance.deleteFile(inputName)
    } catch {}

    try {
      await FFmpegInstance.deleteFile(outputName)
    } catch {}
  }
}

// =====================================================
// FILE HELPERS
// =====================================================

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

// =====================================================
// FIREBASE UPLOAD
// =====================================================

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
        console.error(
          '[MediaUpload] Upload failed:',
          error
        )

        reject(error)
      },

      async () => {
        try {
          const url = await getDownloadURL(
            task.snapshot.ref
          )

          console.log(
            '[MediaUpload] Firebase URL obtained:',
            url
          )

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

// =====================================================
// MAIN COMPOSABLE
// =====================================================

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

  // ===================================================
  // UPLOAD ALL MEDIA
  // ===================================================

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
      // -----------------------------------------------
      // 1. UPLOAD PHOTOS
      // -----------------------------------------------

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

      // -----------------------------------------------
      // 2. AUTOMATIC VIDEO CONVERSION
      // -----------------------------------------------

      if (video) {
        const label = 'video'

        let uploadVideo = video

        setFile(label, {
          loaded: 0,
          total: video.size,
          status: 'converting',
          message: 'Preparing video for iPhone compatibility...',
        })

        try {
          uploadVideo = await convertVideoToMp4(video)

          console.log(
            '[MediaUpload] Using converted MP4 video.'
          )

        } catch (conversionError) {
          console.warn(
            '[MediaUpload] Conversion failed. Using original video instead:',
            conversionError
          )

          uploadVideo = video

          setFile(label, {
            status: 'fallback',
            message: 'Conversion unavailable. Uploading original video.',
          })
        }

        // ---------------------------------------------
        // 3. UPLOAD VIDEO TO EXISTING FIREBASE STORAGE
        // ---------------------------------------------

        setFile(label, {
          loaded: 0,
          total: uploadVideo.size,
          status: 'uploading',
          message: 'Uploading video...',
        })

        // Keep a consistent MP4 path when conversion succeeds.
        // Otherwise preserve the original extension.
        const extension =
          uploadVideo.type === 'video/mp4'
            ? 'mp4'
            : extFromName(uploadVideo.name) || 'mp4'

        const path =
          `incidents/${incidentId}/video.${extension}`

        videoUrl = await uploadOne(
          uploadVideo,
          path,
          (loaded, total) => {
            setFile(label, {
              loaded,
              total,
              status: 'uploading',
            })
          }
        )

        setFile(label, {
          status: 'done',
          url: videoUrl,
          message: 'Video uploaded successfully.',
        })
      }

      // -----------------------------------------------
      // 4. RETURN EXISTING DATA STRUCTURE
      // -----------------------------------------------

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
