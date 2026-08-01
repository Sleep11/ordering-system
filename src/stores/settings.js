import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiRequest } from '@/utils/api'

export const useSettingsStore = defineStore('settings', () => {
  const orderLocked = ref(false)
  const lunchLocked = ref(false)
  const dinnerLocked = ref(false)
  const lunchSelfPick = ref(false)
  const dinnerSelfPick = ref(false)
  const blindLunchPrice = ref(11)
  const blindDinnerPrice = ref(12)
  const loaded = ref(false)

  async function load() {
    const result = await apiRequest('get-settings')
    if (result.success && result.data?.settings) {
      const s = result.data.settings
      orderLocked.value = s.orderLocked || false
      lunchLocked.value = s.lunchLocked || false
      dinnerLocked.value = s.dinnerLocked || false
      lunchSelfPick.value = s.lunchSelfPick || false
      dinnerSelfPick.value = s.dinnerSelfPick || false
      blindLunchPrice.value = s.blindLunchPrice || 11
      blindDinnerPrice.value = s.blindDinnerPrice || 12
      loaded.value = true
    }
  }

  async function update(key, value) {
    const result = await apiRequest('update-settings', { key, value: String(value) })
    if (result.success) return true
    return false
  }

  async function toggleOrderLock() {
    orderLocked.value = !orderLocked.value
    const ok = await update('settings_order_locked', orderLocked.value)
    if (!ok) orderLocked.value = !orderLocked.value
    return ok
  }

  async function toggleLunchLock() {
    lunchLocked.value = !lunchLocked.value
    const ok = await update('settings_lunch_locked', lunchLocked.value)
    if (!ok) lunchLocked.value = !lunchLocked.value
    return ok
  }

  async function toggleDinnerLock() {
    dinnerLocked.value = !dinnerLocked.value
    const ok = await update('settings_dinner_locked', dinnerLocked.value)
    if (!ok) dinnerLocked.value = !dinnerLocked.value
    return ok
  }

  async function toggleLunchSelfPick() {
    lunchSelfPick.value = !lunchSelfPick.value
    const ok = await update('settings_lunch_selfpick', lunchSelfPick.value)
    if (!ok) lunchSelfPick.value = !lunchSelfPick.value
    return ok
  }

  async function toggleDinnerSelfPick() {
    dinnerSelfPick.value = !dinnerSelfPick.value
    const ok = await update('settings_dinner_selfpick', dinnerSelfPick.value)
    if (!ok) dinnerSelfPick.value = !dinnerSelfPick.value
    return ok
  }

  async function setBlindLunchPrice(val) {
    const v = Math.round(parseFloat(val) * 100) / 100
    if (isNaN(v) || v < 0.5 || v > 200) return false
    const ok = await update('settings_blind_lunch_price', v)
    if (ok) blindLunchPrice.value = v
    return ok
  }

  async function setBlindDinnerPrice(val) {
    const v = Math.round(parseFloat(val) * 100) / 100
    if (isNaN(v) || v < 0.5 || v > 200) return false
    const ok = await update('settings_blind_dinner_price', v)
    if (ok) blindDinnerPrice.value = v
    return ok
  }

  return {
    orderLocked, lunchLocked, dinnerLocked,
    lunchSelfPick, dinnerSelfPick,
    blindLunchPrice, blindDinnerPrice, loaded,
    load, toggleOrderLock, toggleLunchLock, toggleDinnerLock,
    toggleLunchSelfPick, toggleDinnerSelfPick,
    setBlindLunchPrice, setBlindDinnerPrice
  }
})
