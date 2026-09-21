import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  // ------------------- Public -------------------
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { public: true },
  },
  {
    path: '/sos',
    name: 'sos',
    component: () => import('@/views/EmergencyView.vue'),
    meta: { public: true },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, guestOnly: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { public: true, guestOnly: true },
  },

  // ------------------- Auth flows -------------------
  {
    path: '/verify-email',
    name: 'verify-email',
    component: () => import('@/views/VerifyEmailView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/setup-account',
    name: 'setup-account',
    component: () => import('@/views/SetupAccountView.vue'),
    meta: { requiresAuth: true },
  },

  // ------------------- Dashboard -------------------
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { requiresAuth: true },
  },

  // ------------------- Fallback -------------------
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.ready()

  // 1. Public routes
  if (to.meta.public && !to.meta.requiresAuth) {
    if (
      to.meta.guestOnly &&
      auth.isAuthenticated &&
      (auth.emailVerified || auth.role !== 'citizen') &&
      !auth.mustChangeCredentials
    ) {
      return { name: 'dashboard' }
    }
    return true
  }

  // 2. Requires auth
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    }
  }

  // 3. Forced account setup for invited users
  if (
    auth.isAuthenticated &&
    auth.mustChangeCredentials &&
    to.name !== 'setup-account'
  ) {
    return { name: 'setup-account' }
  }

  // 4. Skip setup page if nothing to change
  if (
    auth.isAuthenticated &&
    !auth.mustChangeCredentials &&
    to.name === 'setup-account'
  ) {
    return { name: 'dashboard' }
  }

  // 5. Citizens must verify email
  if (
    auth.isAuthenticated &&
    !auth.emailVerified &&
    auth.role === 'citizen' &&
    to.name !== 'verify-email'
  ) {
    return { name: 'verify-email' }
  }

  // 6. Verified user shouldn't be on verify-email
  if (
    (auth.emailVerified || auth.role !== 'citizen') &&
    to.name === 'verify-email'
  ) {
    return { name: 'dashboard' }
  }

  return true
})

export default router
