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
  {
    path: '/verify-email',
    name: 'verify-email',
    component: () => import('@/views/VerifyEmailView.vue'),
    meta: { requiresAuth: true },
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

  // Public route — allow
  if (to.meta.public && !to.meta.requiresAuth) {
    // Guest-only: redirect logged-in AND verified users away
    if (to.meta.guestOnly && auth.isAuthenticated && auth.emailVerified) {
      return { name: 'dashboard' }
    }
    return true
  }

  // Requires auth — must be signed in
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    }
  }

  // Signed in but not verified — force verification screen
  if (
    auth.isAuthenticated &&
    !auth.emailVerified &&
    to.name !== 'verify-email'
  ) {
    return { name: 'verify-email' }
  }

  // Verified user shouldn't be on verify-email
  if (auth.emailVerified && to.name === 'verify-email') {
    return { name: 'dashboard' }
  }

  return true
})

export default router