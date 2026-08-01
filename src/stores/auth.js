import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiRequest } from '@/utils/api'

const STORAGE_KEY = 'ordering_login_v3'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(null)
  const currentUser = ref(null)
  const loading = ref(false)

  const isAdmin = computed(() => currentUser.value?.role === 'admin')
  const isLoggedIn = computed(() => !!token.value)

  function loadSavedLogin() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      return JSON.parse(raw)
    } catch { return null }
  }

  function saveLoginInfo(username, password, tok, remember) {
    try {
      if (remember) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ username, password, token: tok }))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {}
  }

  function clearLoginInfo() {
    localStorage.removeItem(STORAGE_KEY)
  }

  function getSavedCredentials() {
    return loadSavedLogin()
  }

  async function login(username, password, rememberMe) {
    loading.value = true
    try {
      const result = await apiRequest('login', { username, password })
      if (result.success) {
        token.value = result.data.token
        currentUser.value = result.data.user
        saveLoginInfo(username, password, result.data.token, rememberMe)
        return { success: true }
      }
      return { success: false, message: result.message || '登录失败' }
    } catch {
      return { success: false, message: '网络错误' }
    } finally {
      loading.value = false
    }
  }

  async function autoLogin() {
    const saved = getSavedCredentials()
    if (!saved || !saved.token) return false
    token.value = saved.token
    const result = await apiRequest('me')
    if (result.success) {
      currentUser.value = result.data.user
      return true
    }
    token.value = null
    clearLoginInfo()
    return false
  }

  async function logout() {
    try { await apiRequest('logout') } catch {}
    token.value = null
    currentUser.value = null
  }

  async function changePassword(oldPw, newPw) {
    const result = await apiRequest('change-password', { oldPassword: oldPw, newPassword: newPw })
    return result
  }

  return {
    token, currentUser, loading, isAdmin, isLoggedIn,
    login, autoLogin, logout, changePassword,
    getSavedCredentials, clearLoginInfo, saveLoginInfo
  }
})
