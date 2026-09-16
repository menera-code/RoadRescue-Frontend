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
  // the current user's role.
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
 *   2. Public routes → allowed
 *   3. Guest-only routes → redirect verified/eligible users away
 *   4. Auth-required routes → redirect unauthenticated users to /login
 *   5. Citizens who haven't verified email → forced to /verify-email
 *   6. Verified users or non-citizens should not see /verify-email
 */
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.ready()

  // 2. Public route — allow
  if (to.meta.public && !to.meta.requiresAuth) {
    // Guest-only: redirect logged-in users who don't need verification
    if (
      to.meta.guestOnly &&
      auth.isAuthenticated &&
      (auth.emailVerified || auth.role !== 'citizen')
    ) {
      return { name: 'dashboard' }
    }
    return true
  }

  // 4. Requires auth — must be signed in
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    }
  }

  // 5. Unverified CITIZENs are forced to the verify-email screen.
  //    Responders and admins skip verification (system-provisioned accounts).
  if (
    auth.isAuthenticated &&
    !auth.emailVerified &&
    auth.role === 'citizen' &&
    to.name !== 'verify-email'
  ) {
    return { name: 'verify-email' }
  }

  // 6. Verified users OR non-citizens shouldn't be on verify-email
  if (
    (auth.emailVerified || auth.role !== 'citizen') &&
    to.name === 'verify-email'
  ) {
    return { name: 'dashboard' }
  }

  return true
})

export default router