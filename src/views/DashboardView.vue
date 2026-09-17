<script setup>
import { computed } from 'vue'
import { useAuthStore, ROLES } from '@/stores/auth'
import { useHeartbeat } from '@/composables/useHeartbeat'
import CitizenDashboard from './dashboards/CitizenDashboard.vue'
import ResponderDashboard from './dashboards/ResponderDashboard.vue'
import AdminDashboard from './dashboards/AdminDashboard.vue'

const auth = useAuthStore()
useHeartbeat()  // updates lastSeen every 5 min

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