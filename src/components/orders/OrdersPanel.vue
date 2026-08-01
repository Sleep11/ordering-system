<template>
  <section id="section-orders" class="panel">
    <div class="panel__header collapsible-toggle" >
      <h2 class="panel__title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
        本月订单
      </h2>
      
    </div>
    <div class="panel__body collapsible-body" >
      <div v-if="!orders.sortedDates.length" class="empty-state">暂无订单</div>
      <div v-for="date in orders.sortedDates" :key="date" class="date-group">
        <div :class="['date-header', { today: date === today, collapsed: !expandedDates[date] }]" @click="toggleDate(date)">
          <div class="date-title">
            <span class="collapse-indicator">▶</span>
            <span>{{ formatDate(date) }} {{ getDayOfWeek(date) }}</span>
            <span v-if="date === today" class="today-badge">今天</span>
            <span>共 {{ getDateOrders(date).length }} 单</span>
          </div>
          <div class="date-stats">
            <span>已付: {{ getDatePaidCount(date) }}</span>
            <span>未付: {{ getDateOrders(date).length - getDatePaidCount(date) }}</span>
            <span>总额: {{ formatPrice(getDateTotal(date)) }}</span>
          </div>
        </div>
        <div v-show="expandedDates[date]" class="orders-list">
          <!-- Lunch group -->
          <div class="meal-group meal-group--lunch">
            <div class="meal-group__header">
              <div class="meal-group__info">
                <span class="meal-tag lunch">午餐</span>
                <span class="meal-group__count">共 {{ getMealOrders(date, 'lunch').length }} 单</span>
                <span class="meal-group__total">{{ formatPrice(getMealTotal(date, 'lunch')) }}</span>
              </div>
              <div class="meal-group__summary" v-if="getMealOrders(date, 'lunch').length">
                <span class="meal-summary-text">{{ getMealSummaryText(date, 'lunch') }}</span>
                <button class="copy-summary-btn" @click="copySummary(date, 'lunch')">复制</button>
              </div>
            </div>
            <div class="meal-group__orders">
              <div v-for="o in getMealOrders(date, 'lunch')" :key="o.id" class="order-card">
                <span class="order-user">{{ o.personName }}</span>
                <span class="order-detail"><span class="item-name">{{ formatOrderItems(o) }}</span></span>
                <span class="order-money">
                  <span class="money-item money-price"><span class="money-label">价格</span><span class="money-value">{{ formatPrice(getOrderPrice(o)) }}</span></span>
                  <span class="money-item money-receivable"><span class="money-label">应收</span><span class="money-value">{{ formatPrice(getOrderReceivable(o, settings.lunchSelfPick, settings.dinnerSelfPick)) }}</span></span>
                  <span class="money-item money-discount" :class="{ 'has-value': getOrderDiscount(o) > 0 }"><span class="money-label">减免</span><span class="money-value">{{ getOrderDiscount(o) > 0 ? '-' + formatPrice(getOrderDiscount(o)) : formatPrice(0) }}</span></span>
                  <span class="money-item money-actual"><span class="money-label">实收</span><span class="money-value">{{ formatPrice(getOrderActual(o)) }}</span></span>
                  <span class="money-item money-refund" :class="{ refunded: o.refunded }"><span class="money-label">退款</span><span class="money-value">{{ formatPrice(getOrderRefund(o, settings.lunchSelfPick, settings.dinnerSelfPick)) }}</span></span>
                </span>
                <span :class="['order-paid-badge', o.refunded ? 'refunded' : (o.paid ? 'paid paid-dot' : 'unpaid')]">{{ o.refunded ? '已退款' : (o.paid ? '已付' : '未付') }}</span>
                <span class="order-actions">
                  <button v-if="canEdit(o)" class="btn btn-ghost btn-small" @click="$emit('editOrder', o)">修改</button>
                  <template v-if="auth.isAdmin">
                    <button v-if="!o.paid" class="btn btn-ghost btn-small" @click="handlePay(o, true)">标记已付</button>
                    <button v-else class="btn btn-ghost btn-small" @click="handlePay(o, false)">取消已付</button>
                    <button v-if="o.paid && !o.refunded && getOrderDiscount(o) > 0" class="btn btn-ghost btn-small" @click="handleRefund(o)">退款</button>
                  </template>
                  <button v-if="canDelete(o)" class="btn btn-danger btn-small" @click="handleDelete(o)">删除</button>
                </span>
              </div>
            </div>
          </div>
          <!-- Dinner group -->
          <div class="meal-group meal-group--dinner">
            <div class="meal-group__header">
              <div class="meal-group__info">
                <span class="meal-tag dinner">晚餐</span>
                <span class="meal-group__count">共 {{ getMealOrders(date, 'dinner').length }} 单</span>
                <span class="meal-group__total">{{ formatPrice(getMealTotal(date, 'dinner')) }}</span>
              </div>
              <div class="meal-group__summary" v-if="getMealOrders(date, 'dinner').length">
                <span class="meal-summary-text">{{ getMealSummaryText(date, 'dinner') }}</span>
                <button class="copy-summary-btn" @click="copySummary(date, 'dinner')">复制</button>
              </div>
            </div>
            <div class="meal-group__orders">
              <div v-for="o in getMealOrders(date, 'dinner')" :key="o.id" class="order-card">
                <span class="order-user">{{ o.personName }}</span>
                <span class="order-detail"><span class="item-name">{{ formatOrderItems(o) }}</span></span>
                <span class="order-money">
                  <span class="money-item money-price"><span class="money-label">价格</span><span class="money-value">{{ formatPrice(getOrderPrice(o)) }}</span></span>
                  <span class="money-item money-receivable"><span class="money-label">应收</span><span class="money-value">{{ formatPrice(getOrderReceivable(o, settings.lunchSelfPick, settings.dinnerSelfPick)) }}</span></span>
                  <span class="money-item money-discount" :class="{ 'has-value': getOrderDiscount(o) > 0 }"><span class="money-label">减免</span><span class="money-value">{{ getOrderDiscount(o) > 0 ? '-' + formatPrice(getOrderDiscount(o)) : formatPrice(0) }}</span></span>
                  <span class="money-item money-actual"><span class="money-label">实收</span><span class="money-value">{{ formatPrice(getOrderActual(o)) }}</span></span>
                  <span class="money-item money-refund" :class="{ refunded: o.refunded }"><span class="money-label">退款</span><span class="money-value">{{ formatPrice(getOrderRefund(o, settings.lunchSelfPick, settings.dinnerSelfPick)) }}</span></span>
                </span>
                <span :class="['order-paid-badge', o.refunded ? 'refunded' : (o.paid ? 'paid paid-dot' : 'unpaid')]">{{ o.refunded ? '已退款' : (o.paid ? '已付' : '未付') }}</span>
                <span class="order-actions">
                  <button v-if="canEdit(o)" class="btn btn-ghost btn-small" @click="$emit('editOrder', o)">修改</button>
                  <template v-if="auth.isAdmin">
                    <button v-if="!o.paid" class="btn btn-ghost btn-small" @click="handlePay(o, true)">标记已付</button>
                    <button v-else class="btn btn-ghost btn-small" @click="handlePay(o, false)">取消已付</button>
                    <button v-if="o.paid && !o.refunded && getOrderDiscount(o) > 0" class="btn btn-ghost btn-small" @click="handleRefund(o)">退款</button>
                  </template>
                  <button v-if="canDelete(o)" class="btn btn-danger btn-small" @click="handleDelete(o)">删除</button>
                </span>
              </div>
            </div>
          </div>
          <!-- Delete all for date -->
          <div v-if="auth.isAdmin" style="padding:8px 16px;text-align:right;">
            <button class="btn btn-danger btn-small" @click="handleDeleteDate(date)">删除当天全部订单</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, reactive, computed, inject } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useOrdersStore } from '@/stores/orders'
import { useSettingsStore } from '@/stores/settings'
import { getChinaDate, formatDate, getDayOfWeek } from '@/utils/china-date'
import {
  formatPrice, getOrderPrice, getOrderDiscount, getOrderReceivable,
  getOrderActual, getOrderRefund, getOrderItems, getMealSummary
} from '@/utils/format'

const auth = useAuthStore()
const orders = useOrdersStore()
const settings = useSettingsStore()
const toast = inject('toast')
const emit = defineEmits(['editOrder'])

const today = getChinaDate()
const expandedDates = reactive({})

// Initialize expanded dates
for (const date of orders.sortedDates.value) {
  if (!(date in expandedDates)) {
    expandedDates[date] = true
  }
}

function toggleDate(date) {
  expandedDates[date] = !expandedDates[date]
}

function getDateOrders(date) {
  return orders.ordersByDate[date] || []
}

function getMealOrders(date, mealType) {
  return getDateOrders(date).filter(o => o.mealType === mealType)
}

function getDatePaidCount(date) {
  return getDateOrders(date).filter(o => o.paid).length
}

function getDateTotal(date) {
  return getDateOrders(date).reduce((s, o) => s + getOrderReceivable(o, settings.lunchSelfPick, settings.dinnerSelfPick), 0)
}

function getMealTotal(date, mealType) {
  return getMealOrders(date, mealType).reduce((s, o) => s + getOrderReceivable(o, settings.lunchSelfPick, settings.dinnerSelfPick), 0)
}

function getMealSummaryText(date, mealType) {
  return getMealSummary(getMealOrders(date, mealType))
}

function formatOrderItems(o) {
  return getOrderItems(o).map(it => it.name + (it.quantity > 1 ? ' × ' + it.quantity : '')).join('、')
}

function canEdit(o) {
  const isOwner = auth.currentUser?.id === o.userId
  return (isOwner && !settings.orderLocked) || auth.isAdmin
}

function canDelete(o) {
  const isOwner = auth.currentUser?.id === o.userId
  return auth.isAdmin || (isOwner && !settings.orderLocked)
}

async function handlePay(o, paid) {
  const result = await orders.togglePayment(o.id, paid)
  if (result.success) {
    toast.show(paid ? '已标记为已付' : '已取消已付', 'success')
    await orders.refreshNow()
  } else {
    toast.show(result.message || '操作失败', 'error')
  }
}

async function handleRefund(o) {
  const result = await orders.refundOrder(o.id)
  if (result.success) {
    toast.show('已退款', 'success')
    await orders.refreshNow()
  } else {
    toast.show(result.message || '操作失败', 'error')
  }
}

async function handleDelete(o) {
  if (!confirm('确认删除此订单？')) return
  const result = await orders.deleteOrder(o.id)
  if (result.success) {
    toast.show('订单已删除', 'success')
    await orders.refreshNow()
  } else {
    toast.show(result.message || '删除失败', 'error')
  }
}

async function handleDeleteDate(date) {
  if (!confirm('确认删除 ' + date + ' 全部订单？')) return
  const result = await orders.deleteOrdersByDate(date)
  if (result.success) {
    toast.show('已删除', 'success')
    await orders.refreshNow()
  } else {
    toast.show(result.message || '删除失败', 'error')
  }
}

function copySummary(date, mealType) {
  const text = getMealSummaryText(date, mealType)
  navigator.clipboard.writeText(text).then(() => {
    toast.show('已复制', 'success', 1500)
  })
}
</script>
