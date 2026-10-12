// src/services/adminUsers.js
import { getAuth } from 'firebase/auth'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

async function adminFetch(path, options = {}) {
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
  const data = text ? safeJson(text) : null

  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) || text || `HTTP ${res.status}`
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }

  return data
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function listUsers() {
  return adminFetch('/admin/users')
}

export function createUser(payload) {
  return adminFetch('/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateUser(uid, payload) {
  return adminFetch(`/admin/users/${uid}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteUser(uid) {
  return adminFetch(`/admin/users/${uid}`, { method: 'DELETE' })
}

export function listUpdateRequests() {
  return adminFetch('/admin/users/update-requests/all')
}

export function approveUpdateRequest(id) {
  return adminFetch(`/admin/users/update-requests/${id}/approve`, {
    method: 'POST',
  })
}

export function rejectUpdateRequest(id) {
  return adminFetch(`/admin/users/update-requests/${id}/reject`, {
    method: 'POST',
  })
}

export function requestMyUpdate(requestedChanges, reason = '') {
  return adminFetch('/admin/users/request-update', {
    method: 'POST',
    body: JSON.stringify({
      requested_changes: requestedChanges,
      reason,
    }),
  })
}