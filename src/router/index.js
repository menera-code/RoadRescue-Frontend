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

  // ------------------- Authenticated -------------------
  // Renders DashboardView.vue, which internally switches between
  // CitizenDashboard / ResponderDashboard / AdminDashboard based on
  // the current user's role. No separate routes for each role.
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

/**
 * Global navigation guard.
 *
 *   1. Wait for Firebase to restore the session (auth.ready())
 *   2. If route needs auth and user isn't signed in → /login
 *   3. If route is guest-only and user IS signed in → /dashboard
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.ready()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    }
  }

  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }

  return true
})

export default router