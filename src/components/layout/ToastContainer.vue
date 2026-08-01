<template>
  <div class="toast-container" v-if="toasts.length">
    <div
      v-for="t in toasts" :key="t.id"
      :class="['toast', 'toast-enter', 'toast-' + t.type]"
      @click="remove(t.id)"
    >
      <span class="toast-icon"></span>
      <span class="toast-msg">{{ t.message }}</span>
      <span v-if="t.code" class="toast-code">{{ t.code }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const toasts = ref([])
let idCounter = 0

function show(message, type = 'info', duration = 3000) {
  const id = ++idCounter
  toasts.value.push({ id, message, type })
  if (duration > 0) {
    setTimeout(() => remove(id), duration)
  }
}

function remove(id) {
  const idx = toasts.value.findIndex(t => t.id === id)
  if (idx >= 0) toasts.value.splice(idx, 1)
}

defineExpose({ show })

// Provide globally
import { provide } from 'vue'
provide('toast', { show })
</script>
