<template>
  <div class="app-root">
    <LoginPage v-if="!auth.isLoggedIn" />
    <router-view v-else />
    <ToastContainer />
  </div>
</template>

<script setup>
import { useAuthStore } from '@/stores/auth'
import LoginPage from '@/components/login/LoginPage.vue'
import ToastContainer from '@/components/layout/ToastContainer.vue'

const auth = useAuthStore()
</script>
