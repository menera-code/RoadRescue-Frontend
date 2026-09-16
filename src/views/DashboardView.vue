<script setup>
import { computed } from 'vue'
import { useAuthStore, ROLES } from '@/stores/auth'
import CitizenDashboard from './dashboards/CitizenDashboard.vue'
import ResponderDashboard from './dashboards/ResponderDashboard.vue'
import AdminDashboard from './dashboards/AdminDashboard.vue'

const auth = useAuthStore()

/**
 * Pick which dashboard to render based on the current user's role.
 * The router has already guaranteed the user is authenticated
 * (via meta.requiresAuth on the /dashboard route), so we don't need
 * to handle the "not logged in" case here.
 */
const ActiveDashboard = computed(() => {
  switch (auth.role) {
    case ROLES.ADMIN:
      return AdminDashboard
    case ROLES.RESPONDER:
      return ResponderDashboard
    case ROLES.CITIZEN:
    default:
      return CitizenDashboard
  }
})
</script>

<template>
  <component :is="ActiveDashboard" />
</template>