import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiRequest } from '@/utils/api'

export const useDishesStore = defineStore('dishes', () => {
  const dishItems = ref([])
  const loaded = ref(false)
  let lastSignature = ''

  async function load() {
    const result = await apiRequest('get-menu')
    if (result.success && result.data?.menu) {
      dishItems.value = result.data.menu
      dishItems.value.sort((a, b) => (b.weight || 0) - (a.weight || 0))
      loaded.value = true
    }
  }

  function getById(id) {
    return dishItems.value.find(m => m.id === id) || null
  }

  function getBlindBoxId() {
    const bb = dishItems.value.find(m => m.name === '盲盒')
    return bb ? bb.id : ''
  }

  function buildMenuOptions(selectedId = '') {
    let html = '<option value="">-- 选择 --</option>'
    for (const m of dishItems.value) {
      const sel = m.id === selectedId ? ' selected' : ''
      html += `<option value="${m.id}" data-price="${m.price}"${sel}>${m.name}</option>`
    }
    return html
  }

  function getSignature() {
    return dishItems.value.map(m => `${m.id}|${m.name}|${m.price}|${m.weight || 0}`).join('~')
  }

  async function saveFromRows(rows) {
    const updated = []
    for (const row of rows) {
      const id = row.dataset.id
      const name = row.querySelector('.dish-item-name')?.value?.trim() || '未命名'
      const price = parseInt(row.querySelector('.dish-item-price')?.value) || 0
      const weight = parseInt(row.querySelector('.dish-item-weight')?.value) || 0
      updated.push({ id, name, price: Math.max(0, price), weight })
    }
    if (!updated.length) return { success: false, message: '菜品数据为空' }
    updated.sort((a, b) => b.weight - a.weight)

    const sig = updated.map(m => `${m.id}|${m.name}|${m.price}|${m.weight}`).join('~')
    if (sig === lastSignature) return { success: true, message: '未变更' }

    const result = await apiRequest('update-menu', { menu: updated, menuJson: JSON.stringify(updated) })
    if (result.success) {
      lastSignature = sig
      await load() // reload from server to get notes
    }
    return result
  }

  function addNew() {
    const newWeight = dishItems.value.length
      ? Math.max(...dishItems.value.map(m => m.weight || 0)) + 1
      : 100
    dishItems.value.push({ id: 'm' + Date.now(), name: '新餐品', price: 15, weight: newWeight })
  }

  function removeById(id) {
    dishItems.value = dishItems.value.filter(m => m.id !== id)
  }

  return {
    dishItems, loaded, load, getById, getBlindBoxId,
    buildMenuOptions, saveFromRows, addNew, removeById
  }
})
