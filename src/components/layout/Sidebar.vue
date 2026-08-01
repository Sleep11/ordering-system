<template>
  <aside id="sidebar" class="sidebar">
    <nav class="sidebar-nav">
      <a v-for="item in navItems" :key="item.section"
         :href="'#/' + item.section"
         :class="['sidebar-link', { active: currentRoute === item.section }]"
         @click.prevent="navigate(item.section)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="item.icon"></svg>
        {{ item.label }}
      </a>

      <div class="sidebar-section-label">系统设置</div>
      <div class="sidebar-setting">
        <span class="sidebar-setting-label">禁止用户修改餐品</span>
        <label class="toggle-switch">
          <input type="checkbox" :checked="settings.orderLocked" @change="settings.toggleOrderLock()">
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="sidebar-section-label">点餐时段</div>
      <div class="sidebar-setting">
        <span class="sidebar-setting-label">禁止午餐点餐</span>
        <label class="toggle-switch">
          <input type="checkbox" :checked="settings.lunchLocked" @change="settings.toggleLunchLock()">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="sidebar-setting">
        <span class="sidebar-setting-label">禁止晚餐点餐</span>
        <label class="toggle-switch">
          <input type="checkbox" :checked="settings.dinnerLocked" @change="settings.toggleDinnerLock()">
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="sidebar-section-label">盲盒价格</div>
      <div class="sidebar-setting">
        <span class="sidebar-setting-label">午餐盲盒</span>
        <div class="sidebar-price-row">
          <input type="number" :value="settings.blindLunchPrice" @change="e => settings.setBlindLunchPrice(e.target.value)" step="0.5" min="1" max="200">
          <span class="price-unit">元</span>
        </div>
      </div>
      <div class="sidebar-setting">
        <span class="sidebar-setting-label">晚餐盲盒</span>
        <div class="sidebar-price-row">
          <input type="number" :value="settings.blindDinnerPrice" @change="e => settings.setBlindDinnerPrice(e.target.value)" step="0.5" min="1" max="200">
          <span class="price-unit">元</span>
        </div>
      </div>
    </nav>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'

const router = useRouter()
const route = useRoute()
const settings = useSettingsStore()

const currentRoute = computed(() => {
  const name = route.name
  if (name === 'home') return 'order'
  return name || 'order'
})

const navItems = [
  { section: 'order', label: '点餐登记', icon: '<path d="M9 2h6l3 7H6l3-7z"/><path d="M12 9v13"/><path d="M5 16h14"/>' },
  { section: 'stats', label: '今日统计', icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
  { section: 'orders', label: '订单列表', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>' },
  { section: 'report', label: '周月报统计', icon: '<path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>' },
  { section: 'admin', label: '用户管理', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
]

function navigate(section) {
  router.push({ name: section })
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar')?.classList.remove('open')
  }
}
</script>
