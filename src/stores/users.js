import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiRequest } from '@/utils/api'

export const useUsersStore = defineStore('users', () => {
  const allUsers = ref([])
  let lastSignature = ''
  let lastLoadTime = 0

  function getSignature() {
    return allUsers.value.map(u => u.id + '|' + u.name + '|' + u.role).join('~')
  }

  async function load(force = false) {
    const now = Date.now()
    if (!force && now - lastLoadTime < 30000) return
    lastLoadTime = now

    const result = await apiRequest('get-users')
    if (result.success) {
      const users = result.data?.users || []
      const sig = users.map(u => u.id + '|' + u.name + '|' + u.role).join('~')
      if (sig !== lastSignature) {
        lastSignature = sig
        allUsers.value = users
      }
    }
  }

  async function createUser(name, role) {
    return await apiRequest('create-user', { username: name, role })
  }

  async function deleteUser(userId) {
    return await apiRequest('delete-user', { userId })
  }

  async function resetPassword(userId) {
    return await apiRequest('reset-password', { userId })
  }

  return { allUsers, load, createUser, deleteUser, resetPassword }
})
