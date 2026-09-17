import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateEmail as fbUpdateEmail,
  updatePassword as fbUpdatePassword,
} from 'firebase/auth'
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/firebase'

export const ROLES = Object.freeze({
  CITIZEN: 'citizen',
  RESPONDER: 'responder',
  ADMIN: 'admin',
})

export const useAuthStore = defineStore('auth', () => {
  // ---------- State ----------
  const user = ref(null)
  const profile = ref(null)
  const initializing = ref(true)

  let resolveReady
  const readyPromise = new Promise((r) => (resolveReady = r))

  // ---------- Getters ----------
  const isAuthenticated = computed(() => !!user.value)
  const emailVerified = computed(() => !!user.value?.emailVerified)
  const role = computed(() => profile.value?.role ?? null)

  const isCitizen = computed(() => role.value === ROLES.CITIZEN)
  const isResponder = computed(() => role.value === ROLES.RESPONDER)
  const isAdmin = computed(() => role.value === ROLES.ADMIN)

  const isVerifiedResponder = computed(
    () => isResponder.value && profile.value?.status === 'active'
  )

  const mustChangeCredentials = computed(
    () => !!profile.value?.mustChangeCredentials
  )

  const isActive = computed(() => {
    if (!profile.value) return false
    if (isAdmin.value) return true
    if (isResponder.value) return profile.value.status === 'active'
    return (
      profile.value.status !== 'suspended' &&
      profile.value.status !== 'banned'
    )
  })

  // ---------- Helpers ----------
  async function loadProfile(uid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid))
      profile.value = snap.exists() ? { uid, ...snap.data() } : null
    } catch (e) {
      console.error('[auth] failed to load profile', e)
      profile.value = null
    }
  }

  onAuthStateChanged(auth, async (fbUser) => {
    user.value = fbUser
    if (fbUser) {
      await loadProfile(fbUser.uid)
    } else {
      profile.value = null
    }
    if (initializing.value) {
      initializing.value = false
      resolveReady()
    }
  })

  function ready() {
    return readyPromise
  }

  // ---------- Actions ----------
  async function register(payload) {
    const { fullName, email, password, phone, termsVersion } = payload

    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName: fullName })

    try {
      await sendEmailVerification(cred.user)
    } catch (e) {
      console.warn('[auth] could not send verification email', e)
    }

    const docData = {
      uid: cred.user.uid,
      fullName,
      email: email.toLowerCase(),
      phone: phone || '',
      role: ROLES.CITIZEN,
      agency: null,
      badgeId: null,
      status: 'active',
      disabled: false,
      lastSeen: null,
      termsAccepted: true,
      termsVersion,
      termsAcceptedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    await setDoc(doc(db, 'users', cred.user.uid), docData)
    profile.value = { ...docData, createdAt: new Date() }

    return cred.user
  }

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    try {
      await cred.user.reload()
    } catch (e) {
      /* ignore */
    }
    user.value = auth.currentUser
    if (!profile.value) await loadProfile(cred.user.uid)
    return cred.user
  }

  async function logout() {
    await signOut(auth)
    user.value = null
    profile.value = null
  }

  async function resetPassword(email) {
    await sendPasswordResetEmail(auth, email)
  }

  async function resendVerification() {
    if (!user.value) throw new Error('Not signed in')
    await sendEmailVerification(user.value)
  }

  async function reloadUser() {
    if (!user.value) return
    await user.value.reload()
    user.value = { ...user.value }
  }

  /**
   * Invited responders call this on first login.
   * Updates Auth email + password, clears the flag in Firestore.
   */
  async function completeSetup({ newEmail, newPassword }) {
    if (!user.value) throw new Error('Not signed in')

    await fbUpdateEmail(user.value, newEmail)
    await fbUpdatePassword(user.value, newPassword)

    await updateDoc(doc(db, 'users', user.value.uid), {
      email: newEmail.toLowerCase(),
      mustChangeCredentials: false,
      updatedAt: serverTimestamp(),
    })

    profile.value = {
      ...(profile.value || {}),
      email: newEmail.toLowerCase(),
      mustChangeCredentials: false,
    }
  }

  return {
    user,
    profile,
    initializing,
    isAuthenticated,
    emailVerified,
    mustChangeCredentials,
    isCitizen,
    isResponder,
    isAdmin,
    isVerifiedResponder,
    isActive,
    role,
    ready,
    register,
    login,
    logout,
    resetPassword,
    resendVerification,
    reloadUser,
    completeSetup,
  }
})