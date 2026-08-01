import { useAuthStore } from '@/stores/auth'

const API_BASE = '/api.node.js'

export async function apiRequest(action, data = {}, timeoutMs = 10000) {
  const auth = useAuthStore()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  const params = new URLSearchParams()
  if (auth.token) params.append('token', auth.token)
  params.append('action', action)
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      params.append(key, typeof value === 'object' ? JSON.stringify(value) : value)
    }
  }

  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller.signal
    })
    const json = await response.json()
    json._status = response.status
    if (json._status === 401) {
      auth.logout()
    }
    return json
  } finally {
    clearTimeout(timeoutId)
  }
}
