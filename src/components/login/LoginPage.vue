<template>
  <div id="loginPage" class="page">
    <div class="login-container">
      <div class="login-brand">
        <div class="login-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>
            <path d="M7 2v20"/>
            <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>
          </svg>
        </div>
        <h1>点餐系统</h1>
        <p class="subtitle">请使用您的账号登录</p>
      </div>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="username">用户名</label>
          <input type="text" id="username" v-model="username" required autocomplete="username" placeholder="输入用户名">
        </div>
        <div class="form-group">
          <label for="password">密码</label>
          <input type="password" id="password" v-model="password" required autocomplete="current-password" placeholder="输入密码">
        </div>
        <div class="remember-row">
          <label class="remember-label">
            <input type="checkbox" v-model="rememberMe">
            <span class="toggle-track-lg"></span>
            <span class="toggle-text">记住密码，下次自动登录</span>
          </label>
        </div>
        <button type="submit" class="btn btn-primary btn-block" :disabled="loading">
          {{ loading ? '登录中...' : '登录' }}
        </button>
        <div v-if="autoLogging" class="auto-login-hint">正在自动登录...</div>
        <div class="error-message">{{ errorMsg }}</div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const username = ref('')
const password = ref('')
const rememberMe = ref(true)
const loading = ref(false)
const autoLogging = ref(false)
const errorMsg = ref('')

async function handleLogin() {
  if (!username.value.trim() || !password.value) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  errorMsg.value = ''
  const result = await auth.login(username.value.trim(), password.value, rememberMe.value)
  loading.value = false
  if (!result.success) {
    errorMsg.value = result.message || '登录失败'
  }
}

// Auto-login attempt on mount
import { onMounted } from 'vue'
onMounted(async () => {
  const saved = auth.getSavedCredentials()
  if (saved && saved.username && saved.password) {
    autoLogging.value = true
    username.value = saved.username
    password.value = saved.password
    const ok = await auth.autoLogin()
    autoLogging.value = false
    if (!ok) {
      errorMsg.value = '自动登录失败，请手动输入'
    }
  }
})
</script>
