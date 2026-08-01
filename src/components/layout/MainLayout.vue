<template>
  <div id="mainPage" class="page">
    <TopBar @changePassword="showPwModal = true" />
    <div class="layout">
      <Sidebar v-if="auth.isAdmin" />
      <main class="content" id="mainContent">
        <router-view />
      </main>
    </div>
    <PasswordModal v-if="showPwModal" @close="showPwModal = false" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, provide } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useOrdersStore } from '@/stores/orders'
import { useDishesStore } from '@/stores/dishes'
import { useUsersStore } from '@/stores/users'
import TopBar from './TopBar.vue'
import Sidebar from './Sidebar.vue'
import PasswordModal from '@/components/modals/PasswordModal.vue'

const auth = useAuthStore()
const settings = useSettingsStore()
const orders = useOrdersStore()
const dishes = useDishesStore()
const usersStore = useUsersStore()

const showPwModal = ref(false)

function showToast(msg, type, duration) {
  // Global toast - use DOM-based toast for simplicity
  const container = document.getElementById('toastContainer')
  if (!container) {
    const div = document.createElement('div')
    div.id = 'toastContainer'
    div.className = 'toast-container'
    document.body.appendChild(div)
  }
  const tc = document.getElementById('toastContainer')
  const toast = document.createElement('div')
  toast.className = 'toast toast-enter toast-' + (type || 'info')
  toast.innerHTML = '<span class="toast-icon"></span><span class="toast-msg">' + msg + '</span>'
  toast.onclick = () => toast.remove()
  tc.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 300)
  }, duration || 3000)
}

provide('toast', { show: showToast })

onMounted(async () => {
  await settings.load()
  await dishes.load()
  await orders.load()
  orders.startAutoRefresh()
  if (auth.isAdmin) await usersStore.load()
})

onUnmounted(() => {
  orders.stopAutoRefresh()
})
</script>
