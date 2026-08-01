<template>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="topbar-left">
        <button class="btn btn-icon topbar-menu-btn" @click="toggleSidebar" title="切换侧边栏">☰</button>
        <span class="topbar-title">多人在线点餐系统</span>
      </div>
      <div class="topbar-right">
        <span class="topbar-user">{{ auth.currentUser?.name }}</span>
        <span :class="['role-badge', auth.isAdmin ? 'admin' : 'user']">{{ auth.isAdmin ? '管理员' : '用户' }}</span>
        <span v-if="auth.isAdmin" class="version-badge">v3.0.0.17</span>
        <button class="btn btn-ghost btn-small" @click="$emit('changePassword')">修改密码</button>
        <button class="btn btn-refresh" @click="refresh">刷新</button>
        <button v-if="auth.isAdmin" class="btn btn-danger btn-small" @click="handleClearOrders" :disabled="clearLoading">
          {{ clearState === 1 ? '确认清除？' : clearState === 2 ? '处理中...' : '清除订单' }}
        </button>
        <button class="btn btn-ghost btn-small" @click="handleLogout">退出</button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, inject } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useOrdersStore } from '@/stores/orders'

const auth = useAuthStore()
const orders = useOrdersStore()
const toast = inject('toast')
defineEmits(['changePassword'])

const clearState = ref(0)
const clearLoading = ref(false)

function toggleSidebar() { document.getElementById('sidebar')?.classList.toggle('open') }
async function refresh() { await orders.refreshNow(); toast.show('数据已刷新', 'success') }
async function handleLogout() { await auth.logout() }

async function handleClearOrders() {
  if (clearState.value === 0) { clearState.value = 1; setTimeout(() => { if (clearState.value === 1) clearState.value = 0 }, 5000); return }
  if (clearState.value === 1) {
    const pw = prompt('请输入当前管理员密码以确认清除所有订单：')
    if (!pw) { clearState.value = 0; return }
    clearState.value = 2; clearLoading.value = true
    const result = await orders.clearAllOrders(pw)
    clearLoading.value = false; clearState.value = 0
    toast.show(result.success ? (result.message || '订单已清除') : (result.message || '操作失败'), result.success ? 'success' : 'error')
    if (result.success) await orders.refreshNow()
  }
}
</script>
