<template>
  <section id="section-order" class="panel">
    <div class="panel__header"><h2 class="panel__title"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6l3 7H6l3-7z"/><path d="M12 9v13"/><path d="M5 16h14"/></svg>点餐登记</h2></div>
    <div class="panel__body">
      <form @submit.prevent="handleSubmit">
        <div class="form-row">
          <div class="form-group"><label>日期</label><input type="date" v-model="orderDate" required :min="minDate" :max="maxDate"></div>
          <div class="form-group"><label>餐别</label><select v-model="mealType" required><option value="lunch">午餐</option><option value="dinner">晚餐</option></select></div>
        </div>

        <!-- Admin batch -->
        <div v-if="auth.isAdmin" class="form-group">
          <label>订餐列表 <span class="selected-count">已选 {{ selectedUsers.length }} 人</span></label>
          <div class="batch-order-table">
            <div class="batch-order-header">
              <span class="col-checkbox"><input type="checkbox" @change="toggleAll"></span>
              <span class="col-name">姓名</span>
              <span class="col-menu">餐品</span>
              <span class="col-price-hdr">价格</span>
            </div>
            <div v-for="u in users.allUsers" :key="u.id" class="batch-order-row batch-item-row is-first-item">
              <span class="col-checkbox"><input type="checkbox" :value="u.id" v-model="selectedUsers"></span>
              <span class="col-name">{{ u.name }}</span>
              <span class="col-menu">
                <select v-model="batchDish[u.id]" @change="onDishPick(u.id)">
                  <option v-for="m in dishes.dishItems" :key="m.id" :value="m.id">{{ m.name }}</option>
                </select>
              </span>
              <span class="col-price-cell">
                <span class="dish-price-display">{{ priceOf(u.id) }}</span>
                <span class="item-qty-wrap">
                  <button type="button" class="qty-btn" @click="batchQty[u.id] = Math.max(1, (batchQty[u.id]||1)-1)">−</button>
                  <input type="number" class="item-qty" v-model.number="batchQty[u.id]" min="1" style="width:40px">
                  <button type="button" class="qty-btn" @click="batchQty[u.id] = (batchQty[u.id]||1)+1">+</button>
                </span>
              </span>
            </div>
          </div>
          <div v-if="submitState==='confirm'" class="batch-submit-status confirm-prompt">确认提交 {{ mealType==='lunch'?'午餐':'晚餐' }}？共 {{ selectedUsers.length }} 人</div>
        </div>

        <!-- User single -->
        <div v-else class="form-group">
          <label>餐品</label>
          <div class="single-item-row">
            <select v-model="singleDishId" required><option value="">-- 请选择餐品 --</option><option v-for="m in dishes.dishItems" :key="m.id" :value="m.id">{{ m.name }}</option></select>
            <span class="item-qty-wrap"><button type="button" @click="singleQty=Math.max(1,singleQty-1)">−</button><input type="number" v-model.number="singleQty" min="1"><button type="button" @click="singleQty++">+</button></span>
          </div>
          <div class="menu-price-inline">{{ singlePriceText }}</div>
        </div>

        <button type="submit" class="btn btn-primary" :disabled="submitting">{{ submitState==='confirm'?'确认提交':(submitting?'提交中...':'提交订单') }}</button>
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

const auth = useAuthStore()
const orders = useOrdersStore()
const dishes = useDishesStore()
const users = useUsersStore()
const toast = inject('toast')

const orderDate = ref('')
const mealType = ref('lunch')
const selectedUsers = ref([])
const batchDish = reactive({})
const batchQty = reactive({})
const singleDishId = ref('')
const singleQty = ref(1)
const submitState = ref('normal')
const submitting = ref(false)
const minDate = ref('')
const maxDate = ref('')

const singlePriceText = computed(() => {
  if(!singleDishId.value) return '选择餐品后显示价格'
  const m = dishes.getById(singleDishId.value)
  return m ? '价格：¥'+(m.price*singleQty.value)+(singleQty.value>1?'（'+singleQty.value+'份）':'') : ''
})

function priceOf(uid) {
  const did = batchDish[uid]
  if(!did) return '-'
  const m = dishes.getById(did)
  if(!m) return '-'
  return '¥'+(m.price*(batchQty[uid]||1))
}

function onDishPick(uid) {}
function toggleAll(e) { selectedUsers.value = e.target.checked ? users.allUsers.map(u=>u.id) : [] }

async function handleSubmit() {
  if(auth.isAdmin) {
    if(!selectedUsers.value.length){toast.show('请至少选择一个订餐人员','info');return}
    if(submitState.value!=='confirm'){submitState.value='confirm';return}
    submitState.value='normal'; submitting.value=true
    for(const uid of selectedUsers.value){
      const did=batchDish[uid]; if(!did) continue
      const u=users.allUsers.find(x=>x.id===uid); const m=dishes.getById(did)
      const qty=batchQty[uid]||1; if(!u||!m) continue
      await orders.createOrder({userId:uid,personName:u.name,date:orderDate.value,mealType:mealType.value,itemType:'menu',menuId:did,items:[{menuId:did,name:m.name,price:m.price,quantity:qty}]})
    }
    toast.show('批量订单提交成功','success'); await orders.refreshNow(); submitting.value=false
  }else{
    if(!singleDishId.value){toast.show('请选择餐品','info');return}
    submitting.value=true; const m=dishes.getById(singleDishId.value)
    const r=await orders.createOrder({date:orderDate.value,mealType:mealType.value,itemType:'menu',menuId:singleDishId.value,items:[{menuId:singleDishId.value,name:m?.name||'',price:m?.price||0,quantity:singleQty.value}]})
    submitting.value=false; toast.show(r.success?'订单提交成功':(r.message||'提交失败'),r.success?'success':'error')
    if(r.success) await orders.refreshNow()
  }
}

onMounted(async () => {
  if(auth.isAdmin) await users.load()
  await dishes.load()
  orderDate.value = getChinaDate()
  const { totalMin } = getChinaHourMin()
  if(totalMin>=8*60&&totalMin<11*60+30) mealType.value='lunch'
  else if(totalMin>=11*60+30&&totalMin<20*60+30) mealType.value='dinner'
  else { mealType.value='lunch'; const n=new Date(); orderDate.value=new Date(Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate()+1)).toISOString().split('T')[0] }
  const now=new Date(); const chinaTs=now.getTime()+8*3600*1000
  minDate.value=new Date(chinaTs-30*86400000).toISOString().split('T')[0]
  maxDate.value=new Date(chinaTs+30*86400000).toISOString().split('T')[0]

  // Default batch to blind box
  const bb = dishes.getBlindBoxId()
  if(bb) users.allUsers.forEach(u => { if(!batchDish[u.id]) batchDish[u.id]=bb; if(!batchQty[u.id]) batchQty[u.id]=1 })
})
</script>
