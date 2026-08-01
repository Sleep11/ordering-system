<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal__header">
        <h3>修改密码</h3>
        <button class="btn btn-icon modal-close" @click="$emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label>旧密码</label>
          <input type="password" v-model="oldPw" required>
        </div>
        <div class="form-group">
          <label>新密码</label>
          <input type="password" v-model="newPw" required minlength="6">
        </div>
        <div class="form-group">
          <label>确认新密码</label>
          <input type="password" v-model="confirmPw" required minlength="6">
        </div>
        <div v-if="error" class="error-message">{{ error }}</div>
        <div class="modal__actions">
          <button type="submit" class="btn btn-primary">确认修改</button>
          <button type="button" class="btn btn-secondary" @click="$emit('close')">取消</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, inject } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const toast = inject('toast')
const emit = defineEmits(['close'])
const oldPw = ref('')
const newPw = ref('')
const confirmPw = ref('')
const error = ref('')

async function handleSubmit() {
  error.value = ''
  if (newPw.value !== confirmPw.value) { error.value = '两次密码不一致'; return }
  const result = await auth.changePassword(oldPw.value, newPw.value)
  if (result.success) {
    toast.show('密码修改成功', 'success')
    emit('close')
  } else {
    error.value = result.message || '修改失败'
  }
}
</script>
