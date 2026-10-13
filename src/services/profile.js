// src/services/profile.js
//
// Client for /me/update — lets the signed-in user edit their own profile.

import { getAuth } from 'firebase/auth'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

async function authedFetch(path, options = {}) {
  const user = getAuth().currentUser
  if (!user) throw new Error('Not signed in')

  const token = await user.getIdToken()

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })

  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) || text || `HTTP ${res.status}`
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }

  return data
}

export function updateMyProfile(payload) {
  return authedFetch('/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}