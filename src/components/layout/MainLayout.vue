<template>
  <div id="mainPage" class="page">
    <TopBar />
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
import { ref, onMounted, onUnmounted, inject } from 'vue'
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
const users = useUsersStore()

const showPwModal = ref(false)
const toast = inject('toast')

onMounted(async () => {
  await settings.load()
  await dishes.load()
  await orders.load()
  orders.startAutoRefresh()
  if (auth.isAdmin) await users.load()

  // Provide showPwModal to TopBar
  window.__showPwModal = () => { showPwModal.value = true }
})

onUnmounted(() => {
  orders.stopAutoRefresh()
})
</script>
