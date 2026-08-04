<template>
  <section id="section-report" class="panel">
    <div class="panel__header">
      <h2 class="panel__title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
        周月报统计
      </h2>
      <div class="report-nav">
        <button class="report-nav-btn" @click="offset--; load()">◀</button>
        <div class="report-tabs">
          <button :class="['report-tab', { active: mode === 'week' }]" @click="mode = 'week'; offset = 0; load()">本周</button>
          <button :class="['report-tab', { active: mode === 'month' }]" @click="mode = 'month'; offset = 0; load()">本月</button>
        </div>
        <button class="report-nav-btn" @click="offset++; load()">▶</button>
      </div>
    </div>
    <div class="panel__body">
      <div v-if="report" class="report-range">{{ rangeLabel }}</div>
      <div v-if="report" class="report-cards">
        <div class="report-card"><div class="report-card-value">{{ summary.totalOrders }}</div><div class="report-card-label">订单总数</div></div>
        <div class="report-card report-card--success"><div class="report-card-value">{{ summary.paidCount }}</div><div class="report-card-label">已付款</div></div>
        <div class="report-card report-card--danger"><div class="report-card-value">{{ summary.unpaidCount }}</div><div class="report-card-label">未付款</div></div>
        <div class="report-card"><div class="report-card-value">{{ formatPrice(summary.totalAmount) }}</div><div class="report-card-label">总金额</div></div>
        <div class="report-card report-card--success"><div class="report-card-value">{{ formatPrice(summary.paidAmount) }}</div><div class="report-card-label">已付金额</div></div>
        <div class="report-card report-card--danger"><div class="report-card-value">{{ formatPrice(summary.unpaidAmount) }}</div><div class="report-card-label">未付金额</div></div>
      </div>
      <div v-if="report && report.perPerson" class="report-table-wrap">
        <table class="report-table">
          <thead><tr><th>姓名</th><th>订单数</th><th>已付款</th><th>金额</th></tr></thead>
          <tbody>
            <tr v-for="p in report.perPerson" :key="p.name">
              <td>{{ p.name }}</td><td>{{ p.count }}</td><td>{{ p.paid }}</td><td>{{ formatPrice(p.amount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="!report" class="empty-state">点击上方选项卡加载数据</div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { apiRequest } from '@/utils/api'
import { formatPrice } from '@/utils/format'

const mode = ref('week')
const offset = ref(0)
const report = ref(null)

const summary = computed(() => report.value?.summary || {})
const rangeLabel = computed(() => report.value ? `${report.value.range.from} ~ ${report.value.range.to}` : '')

async function load() {
  report.value = null
  const result = await apiRequest('get-report', { type: mode.value, offset: offset.value })
  if (result.success) report.value = result.data
}

onMounted(() => load())
</script>
