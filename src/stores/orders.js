import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiRequest } from '@/utils/api'
import { getChinaDate } from '@/utils/china-date'

export const useOrdersStore = defineStore('orders', () => {
  const allOrders = ref([])
  const lastHash = ref('')
  let refreshTimer = null
  let lastRefreshTime = 0

  const todayOrders = computed(() => {
    const today = getChinaDate()
    return allOrders.value.filter(o => o.date === today)
  })

  const ordersByDate = computed(() => {
    const groups = {}
    for (const o of allOrders.value) {
      if (!groups[o.date]) groups[o.date] = []
      groups[o.date].push(o)
    }
    return groups
  })

  const sortedDates = computed(() => {
    return Object.keys(ordersByDate.value).sort().reverse()
  })

  async function load() {
    const now = Date.now()
    if (now - lastRefreshTime < 3000) return
    lastRefreshTime = now

    const result = await apiRequest('get-orders')
    if (result.success) {
      const orders = result.data?.orders || []
      const hash = JSON.stringify(orders)
      if (hash !== lastHash.value) {
        lastHash.value = hash
        allOrders.value = orders
      }
    }
  }

  async function createOrder(data) {
    return await apiRequest('create-order', data)
  }

  async function deleteOrder(orderId) {
    return await apiRequest('delete-order', { orderId })
  }

  async function deleteOrdersByDate(date) {
    return await apiRequest('delete-orders-by-date', { date })
  }

  async function togglePayment(orderId, paid) {
    return await apiRequest('update-payment', { orderId, paid })
  }

  async function refundOrder(orderId) {
    return await apiRequest('refund-order', { orderId })
  }

  async function clearAllOrders(password) {
    return await apiRequest('clear-all-orders', { password })
  }

  function startAutoRefresh(intervalMs = 8000) {
    stopAutoRefresh()
    refreshTimer = setInterval(() => {
      if (!document.hidden) load()
    }, intervalMs)
    document.addEventListener('visibilitychange', onVisibility)
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
    document.removeEventListener('visibilitychange', onVisibility)
  }

  function onVisibility() {
    if (!document.hidden) {
      lastRefreshTime = 0
      load()
    }
  }

  async function refreshNow() {
    lastRefreshTime = 0
    lastHash.value = ''
    await load()
  }

  return {
    allOrders, todayOrders, ordersByDate, sortedDates,
    load, createOrder, deleteOrder, deleteOrdersByDate,
    togglePayment, refundOrder, clearAllOrders,
    startAutoRefresh, stopAutoRefresh, refreshNow
  }
})
