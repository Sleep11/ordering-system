<template>
  <section id="section-admin" class="panel collapsible">
    <div class="panel__header collapsible-toggle" @click="collapsed = !collapsed">
      <h2 class="panel__title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        用户管理
      </h2>
      <svg class="collapse-arrow" :class="{ collapsed }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="panel__body collapsible-body" :class="{ collapsed }">
      <form class="form-inline" @submit.prevent="addUser">
        <div class="form-group">
          <label>用户名</label>
          <input type="text" v-model="newName" required placeholder="输入新用户名">
        </div>
        <div class="form-group">
          <label>角色</label>
          <select v-model="newRole">
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary">添加用户</button>
      </form>
      <div class="users-list">
        <div v-for="u in users.allUsers" :key="u.id" class="user-card">
          <div>
            <span class="user-name">{{ u.name }}</span>
            <span :class="['user-role-tag', u.role]">{{ u.role === 'admin' ? '管理员' : '用户' }}</span>
          </div>
          <div class="user-actions">
            <button class="btn btn-ghost btn-small" @click="resetPw(u.id)">重置密码</button>
            <button class="btn btn-danger btn-small" @click="deleteUser(u.id)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, inject } from 'vue'
import { useUsersStore } from '@/stores/users'

const users = useUsersStore()
const toast = inject('toast')
const collapsed = ref(false)
const newName = ref('')
const newRole = ref('user')

async function addUser() {
  if (!newName.value.trim()) return
  const result = await users.createUser(newName.value.trim(), newRole.value)
  if (result.success) {
    toast.show('用户已添加', 'success')
    newName.value = ''
    await users.load(true)
  } else {
    toast.show(result.message || '添加失败', 'error')
  }
}

async function deleteUser(userId) {
  if (!confirm('确认删除此用户？')) return
  const result = await users.deleteUser(userId)
  if (result.success) {
    toast.show('用户已删除', 'success')
    await users.load(true)
  } else {
    toast.show(result.message || '删除失败', 'error')
  }
}

async function resetPw(userId) {
  const result = await users.resetPassword(userId)
  if (result.success) {
    toast.show('密码已重置为 123456', 'success')
  } else {
    toast.show(result.message || '操作失败', 'error')
  }
}
</script>
