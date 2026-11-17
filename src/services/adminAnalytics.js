const API_URL = (
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
).replace(/\/$/, '')

/**
 * RoadRescue Admin Analytics API Service
 *
 * Connects the frontend to existing FastAPI analytics endpoints.
 * This file does not create or modify any backend routes.
 */

function parseResponseBody(text) {
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function getAdminAnalytics(endpoint, params = {}) {
  const cleanEndpoint = String(endpoint || '').replace(/^\/+|\/+$/g, '')

  if (!cleanEndpoint) {
    throw new Error('Analytics endpoint is required.')
  }

  const query = new URLSearchParams()

  Object.entries(params || {}).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      query.set(key, String(value))
    }
  })

  const queryString = query.toString()

  const url = `${API_URL}/analytics/${cleanEndpoint}${
    queryString ? `?${queryString}` : ''
  }`

  let response

  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
  } catch (error) {
    console.error('[Admin Analytics] Network error:', error)

    throw new Error(
      `Unable to connect to the RoadRescue backend. Check your VITE_API_URL setting and backend availability.`
    )
  }

  const rawResponse = await response.text()
  const data = parseResponseBody(rawResponse)

  if (!response.ok) {
    const message =
      data && typeof data === 'object'
        ? data.detail || data.message || data.error
        : data

    throw new Error(
      message
        ? String(message)
        : `Analytics request failed. HTTP ${response.status}`
    )
  }

  if (typeof data === 'string') {
    throw new Error(
      'The analytics endpoint returned an invalid JSON response.'
    )
  }

  return data || {}
}

export function getAnalyticsApiUrl() {
  return API_URL
}
