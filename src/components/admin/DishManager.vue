<template>
  <section id="section-dish" class="panel collapsible">
    <div class="panel__header collapsible-toggle" @click="collapsed = !collapsed">
      <h2 class="panel__title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        菜品管理
      </h2>
      <svg class="collapse-arrow" :class="{ collapsed }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="panel__body collapsible-body" :class="{ collapsed }">
      <div class="menu-toolbar">
        <button class="btn btn-ghost btn-small" @click="dishes.addNew()">+ 添加餐品</button>
        <button class="btn btn-ghost btn-small" @click="saveAll">保存菜品</button>
        <span class="menu-hint">改价后点保存生效 | 权重高排前面</span>
      </div>
      <div class="menu-list">
        <div v-for="(m, i) in dishes.dishItems" :key="m.id" class="dish-item-row" :data-id="m.id">
          <span class="dish-item-drag">☰</span>
          <input type="text" class="dish-item-name" :value="m.name" @input="e => m.name = e.target.value" placeholder="名称">
          <span class="dish-price-wrap"><span class="dish-yen">¥</span><input type="number" class="dish-item-price" :value="m.price" @input="e => m.price = parseInt(e.target.value) || 0" step="1" min="0"></span>
          <label class="dish-item-weight-label">权重 <input type="number" class="dish-item-weight" :value="m.weight" @input="e => m.weight = parseInt(e.target.value) || 0" step="1" min="0"></label>
          <button class="btn btn-danger btn-small dish-item-del" @click="dishes.removeById(m.id)">×</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, inject } from 'vue'
import { useDishesStore } from '@/stores/dishes'

const dishes = useDishesStore()
const toast = inject('toast')
const collapsed = ref(false)

async function saveAll() {
  const rows = document.querySelectorAll('.dish-item-row')
  const result = await dishes.saveFromRows(rows)
  if (result.success) {
    toast.show('菜品已保存', 'success')
  } else {
    toast.show(result.message || '保存失败', 'error')
  }
}
</script>
