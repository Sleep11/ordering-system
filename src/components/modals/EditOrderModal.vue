<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal__header">
        <h3>修改餐品</h3>
        <button class="btn btn-icon modal-close" @click="$emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label>订餐人</label>
          <p class="form-help">{{ order?.personName }}</p>
        </div>
        <div class="form-group">
          <label>日期</label>
          <p class="form-help">{{ order ? formatDate(order.date) + ' ' + getDayOfWeek(order.date) : '' }}</p>
        </div>
        <div class="form-group">
          <label>餐别</label>
          <select v-model="editMealType" required>
            <option value="lunch">午餐</option>
            <option value="dinner">晚餐</option>
          </select>
        </div>
        <div class="form-group">
          <label>餐品</label>
          <select v-model="editDishId" required>
            <option value="">-- 请选择餐品 --</option>
            <option v-for="m in dishes.dishItems" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
          <p class="menu-price-hint">{{ priceHint }}</p>
        </div>
        <div v-if="error" class="error-message">{{ error }}</div>
        <div class="modal__actions">
          <button type="submit" class="btn btn-primary">保存修改</button>
          <button type="button" class="btn btn-secondary" @click="$emit('close')">取消</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, inject } from 'vue'
import { useOrdersStore } from '@/stores/orders'
import { useDishesStore } from '@/stores/dishes'
import { formatDate, getDayOfWeek } from '@/utils/china-date'
import { formatPrice } from '@/utils/format'

const props = defineProps({ order: Object })
const emit = defineEmits(['close', 'saved'])
const orders = useOrdersStore()
const dishes = useDishesStore()
const toast = inject('toast')

const editMealType = ref(props.order?.mealType || 'lunch')
const editDishId = ref('')
const error = ref('')

const priceHint = computed(() => {
  const m = dishes.getById(editDishId.value)
  return m ? '价格：' + formatPrice(m.price) : ''
})

// Init: try to match existing order item
import { onMounted } from 'vue'
onMounted(() => {
  if (props.order) {
    const items = props.order.items || []
    if (items.length && items[0].menuId) {
      editDishId.value = items[0].menuId
    } else {
      // Try to match by name
      const m = dishes.dishItems.find(d => d.name === props.order.itemName)
      if (m) editDishId.value = m.id
    }
  }
})

async function handleSubmit() {
  error.value = ''
  if (!editDishId.value) { error.value = '请选择餐品'; return }
  const m = dishes.getById(editDishId.value)
  if (!m) { error.value = '餐品不存在'; return }
  const result = await orders.createOrder({
    userId: props.order.userId,
    personName: props.order.personName,
    date: props.order.date,
    mealType: editMealType.value,
    itemType: 'menu',
    menuId: m.id,
    items: [{ menuId: m.id, name: m.name, price: m.price, quantity: 1 }]
  })
  if (result.success) {
    toast.show('修改成功', 'success')
    await orders.refreshNow()
    emit('saved')
    emit('close')
  } else {
    error.value = result.message || '修改失败'
  }
}
</script>
