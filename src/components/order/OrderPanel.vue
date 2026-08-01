<template>
  <section id="section-order" class="panel">
    <div class="panel__header">
      <h2 class="panel__title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 2h6l3 7H6l3-7z"/><path d="M12 9v13"/><path d="M5 16h14"/>
        </svg>
        点餐登记
      </h2>
    </div>
    <div class="panel__body">
      <form @submit.prevent="handleSubmit">
        <div class="form-row">
          <div class="form-group">
            <label for="orderDate">日期</label>
            <input type="date" id="orderDate" v-model="orderDate" required :min="minDate" :max="maxDate">
          </div>
          <div class="form-group">
            <label for="mealType">餐别</label>
            <select id="mealType" v-model="mealType" required>
              <option value="lunch">午餐</option>
              <option value="dinner">晚餐</option>
            </select>
          </div>
        </div>

        <!-- 管理员批量订餐 -->
        <div v-if="auth.isAdmin" class="form-group">
          <label>订餐列表 <span class="selected-count">已选 {{ selectedCount }} 人</span></label>
          <div class="batch-order-table">
            <div class="batch-order-header">
              <span class="col-checkbox"><input type="checkbox" v-model="selectAll" @change="toggleSelectAll"></span>
              <span class="col-name">姓名</span>
              <span class="col-menu">餐品</span>
              <span class="col-price-hdr">价格</span>
            </div>
            <div id="batchOrderRows">
              <div v-for="user in users.allUsers" :key="user.id" class="batch-user-group">
                <div class="batch-order-row batch-item-row is-first-item">
                  <span class="col-checkbox">
                    <input type="checkbox" class="user-checkbox" :value="user.id" v-model="selectedUsers">
                  </span>
                  <span class="col-name">{{ user.name }}</span>
                  <span class="col-menu">
                    <select class="dish-select" v-model="batchSelections[user.id]" @change="onDishChange(user.id)">
                      <option value="">-- 选择 --</option>
                      <option v-for="m in dishes.dishItems" :key="m.id" :value="m.id" :data-price="m.price">{{ m.name }}</option>
                    </select>
                  </span>
                  <span class="col-price-cell">
                    <span class="dish-price-display">{{ getBatchPrice(user.id) }}</span>
                    <span class="item-qty-wrap">
                      <button type="button" class="qty-btn" @click="decQty(user.id)">−</button>
                      <input type="number" class="item-qty" v-model.number="batchQtys[user.id]" min="1">
                      <button type="button" class="qty-btn" @click="incQty(user.id)">+</button>
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="submitState === 'confirm'" class="batch-submit-status confirm-prompt">
            确认提交 {{ mealType === 'lunch' ? '午餐' : '晚餐' }} 订单？共 {{ selectedCount }} 人
          </div>
        </div>

        <!-- 普通用户单人点餐 -->
        <div v-else class="form-group">
          <label for="singleDishItem">餐品</label>
          <div class="single-item-row">
            <select id="singleDishItem" v-model="singleDishId" required>
              <option value="">-- 请选择餐品 --</option>
              <option v-for="m in dishes.dishItems" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
            <span class="item-qty-wrap">
              <button type="button" @click="singleQty = Math.max(1, singleQty - 1)">−</button>
              <input type="number" v-model.number="singleQty" min="1">
              <button type="button" @click="singleQty++">+</button>
            </span>
          </div>
          <div class="menu-price-inline">{{ singleDishPriceText }}</div>
        </div>

        <button type="submit" class="btn btn-primary" :disabled="submitting">
          {{ submitState === 'confirm' ? '确认提交' : (submitting ? '提交中...' : '提交订单') }}
        </button>
      </form>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, reactive, onMounted, inject } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useOrdersStore } from '@/stores/orders'
import { useDishesStore } from '@/stores/dishes'
import { useUsersStore } from '@/stores/users'
import { getChinaDate, getChinaHourMin } from '@/utils/china-date'
import { formatPrice } from '@/utils/format'

const auth = useAuthStore()
const orders = useOrdersStore()
const dishes = useDishesStore()
const usersStore = useUsersStore()
const toast = inject('toast')
const users = usersStore

const orderDate = ref('')
const mealType = ref('lunch')
const selectedUsers = ref([])
const selectAll = ref(false)
const batchSelections = reactive({})
const batchQtys = reactive({})
const singleDishId = ref('')
const singleQty = ref(1)
const submitState = ref('normal') // normal | confirm
const submitting = ref(false)

const selectedCount = computed(() => selectedUsers.value.length)

const singleDishPriceText = computed(() => {
  if (!singleDishId.value) return '选择餐品后显示价格'
  const m = dishes.getById(singleDishId.value)
  if (!m) return ''
  return '价格：¥' + (parseFloat(m.price) * singleQty.value) + (singleQty.value > 1 ? '（' + singleQty.value + ' 份）' : '')
})

function getBatchPrice(userId) {
  const dishId = batchSelections[userId]
  if (!dishId) return '-'
  const m = dishes.getById(dishId)
  if (!m) return '-'
  const qty = batchQtys[userId] || 1
  return '¥' + (parseFloat(m.price) * qty)
}

function onDishChange(userId) {
  // Force re-render
}

function incQty(userId) {
  if (!batchQtys[userId]) batchQtys[userId] = 1
  batchQtys[userId]++
}

function decQty(userId) {
  if (!batchQtys[userId]) batchQtys[userId] = 1
  batchQtys[userId] = Math.max(1, batchQtys[userId] - 1)
}

function toggleSelectAll() {
  if (selectAll.value) {
    selectedUsers.value = users.allUsers.map(u => u.id)
  } else {
    selectedUsers.value = []
  }
}

async function handleSubmit() {
  if (auth.isAdmin) {
    if (!selectedUsers.value.length) {
      toast.show('请至少选择一个订餐人员', 'info')
      return
    }
    if (submitState.value !== 'confirm') {
      submitState.value = 'confirm'
      return
    }
    submitState.value = 'normal'
    submitting.value = true

    for (const userId of selectedUsers.value) {
      const dishId = batchSelections[userId]
      if (!dishId) continue
      const user = users.allUsers.find(u => u.id === userId)
      const m = dishes.getById(dishId)
      const qty = batchQtys[userId] || 1
      if (!user || !m) continue
      const data = {
        userId, personName: user.name, date: orderDate.value, mealType: mealType.value,
        itemType: 'menu', menuId: dishId, items: [{ menuId: dishId, name: m.name, price: m.price, quantity: qty }]
      }
      await orders.createOrder(data)
    }
    toast.show('批量订单提交成功', 'success')
    await orders.refreshNow()
    submitting.value = false
  } else {
    if (!singleDishId.value) {
      toast.show('请选择餐品', 'info')
      return
    }
    submitting.value = true
    const m = dishes.getById(singleDishId.value)
    const result = await orders.createOrder({
      date: orderDate.value, mealType: mealType.value,
      itemType: 'menu', menuId: singleDishId.value,
      items: [{ menuId: singleDishId.value, name: m?.name || '', price: m?.price || 0, quantity: singleQty.value }]
    })
    submitting.value = false
    if (result.success) {
      toast.show('订单提交成功', 'success')
      await orders.refreshNow()
    } else {
      toast.show(result.message || '提交失败', 'error')
    }
  }
}

onMounted(async () => {
  if (auth.isAdmin) await users.load()
  await dishes.load()

  // Set date defaults
  orderDate.value = getChinaDate()
  const { minute, totalMin } = getChinaHourMin()
  if (totalMin >= 8 * 60 && totalMin < 11 * 60 + 30) {
    mealType.value = 'lunch'
  } else if (totalMin >= 11 * 60 + 30 && totalMin < 20 * 60 + 30) {
    mealType.value = 'dinner'
  } else {
    mealType.value = 'lunch'
    const now = new Date()
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    orderDate.value = tomorrow.toISOString().split('T')[0]
  }

  // Set min/max dates
  const now = new Date()
  const chinaTs = now.getTime() + 8 * 3600 * 1000
  minDate.value = new Date(chinaTs - 30 * 86400000).toISOString().split('T')[0]
  maxDate.value = new Date(chinaTs + 30 * 86400000).toISOString().split('T')[0]
})

const minDate = ref('')
const maxDate = ref('')
</script>
