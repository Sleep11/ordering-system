<template>
  <section id="section-stats" class="panel">
    <div class="panel__header">
      <h2 class="panel__title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
        今日统计
      </h2>
      <div v-if="auth.isAdmin" class="selfpick-inline">
        <label class="selfpick-pill" :class="{ active: settings.lunchSelfPick }">
          <input type="checkbox" :checked="settings.lunchSelfPick" @change="settings.toggleLunchSelfPick()">
          <span>午餐自取减免</span>
        </label>
        <label class="selfpick-pill" :class="{ active: settings.dinnerSelfPick }">
          <input type="checkbox" :checked="settings.dinnerSelfPick" @change="settings.toggleDinnerSelfPick()">
          <span>晚餐自取减免</span>
        </label>
      </div>
    </div>
    <div class="panel__body">
      <div class="metric-strip">
        <div class="metric-card">
          <div class="metric-value">{{ stats.totalOrders }}</div>
          <div class="metric-label">订单总数</div>
        </div>
        <div class="metric-card metric-card--success">
          <div class="metric-value">{{ stats.paidOrders }}</div>
          <div class="metric-label">已付款</div>
        </div>
        <div class="metric-card metric-card--danger">
          <div class="metric-value">{{ stats.unpaidOrders }}</div>
          <div class="metric-label">未付款</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">{{ formatPrice(stats.totalAmount) }}</div>
          <div class="metric-label">总金额</div>
        </div>
        <div class="metric-card metric-card--success">
          <div class="metric-value">{{ formatPrice(stats.paidAmount) }}</div>
          <div class="metric-label">已付金额</div>
        </div>
        <div class="metric-card metric-card--danger">
          <div class="metric-value">{{ formatPrice(stats.totalAmount - stats.paidAmount) }}</div>
          <div class="metric-label">未付金额</div>
        </div>
        <div class="metric-card metric-card--refund">
          <div class="metric-value">{{ formatPrice(stats.refundAmount) }}</div>
          <div class="metric-label">退款金额</div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useOrdersStore } from '@/stores/orders'
import { useSettingsStore } from '@/stores/settings'
import { getChinaDate } from '@/utils/china-date'
import { formatPrice, getOrderReceivable, getOrderActual, getOrderRefund } from '@/utils/format'

const auth = useAuthStore()
const orders = useOrdersStore()
const settings = useSettingsStore()

const stats = computed(() => {
  const today = getChinaDate()
  let totalOrders = 0, paidOrders = 0, totalAmount = 0, paidAmount = 0, refundAmount = 0
  for (const o of orders.allOrders) {
    if (o.date !== today) continue
    totalOrders++
    totalAmount += getOrderReceivable(o, settings.lunchSelfPick, settings.dinnerSelfPick)
    if (o.paid) {
      paidOrders++
      paidAmount += getOrderActual(o)
      if (o.refunded) refundAmount += getOrderRefund(o, settings.lunchSelfPick, settings.dinnerSelfPick)
    }
  }
  return { totalOrders, paidOrders, unpaidOrders: totalOrders - paidOrders, totalAmount, paidAmount, refundAmount }
})
</script>
