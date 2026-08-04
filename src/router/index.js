import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/components/layout/MainLayout.vue'),
    meta: { requiresAuth: true },
    redirect: '/order',
    children: [
      { path: 'order', name: 'order', component: () => import('@/components/order/OrderPanel.vue') },
      { path: 'stats', name: 'stats', component: () => import('@/components/stats/StatsPanel.vue') },
      { path: 'orders', name: 'orders', component: () => import('@/components/orders/OrdersPanel.vue') },
      { path: 'report', name: 'report', component: () => import('@/components/report/ReportPanel.vue'), meta: { requiresAdmin: true } },
      { path: 'dish', name: 'dish', component: () => import('@/components/admin/DishManager.vue'), meta: { requiresAdmin: true } },
      { path: 'admin', name: 'admin', component: () => import('@/components/admin/UserManager.vue'), meta: { requiresAdmin: true } }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  if (to.meta.requiresAdmin && auth.currentUser && !auth.isAdmin) {
    next({ name: 'order' })
  } else {
    next()
  }
})

export default router
