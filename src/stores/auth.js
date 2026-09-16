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
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/firebase'

// The three roles recognised by the platform.
// Only 'citizen' accounts can be created via the public registration form.
// 'responder' and 'admin' accounts are provisioned by administrators only.
export const ROLES = Object.freeze({
  CITIZEN: 'citizen',
  RESPONDER: 'responder',
  ADMIN: 'admin',
})

export const useAuthStore = defineStore('auth', () => {
  // ---------- State ----------
  const user = ref(null)        // Firebase Auth user object
  const profile = ref(null)     // Firestore users/{uid} document data
  const initializing = ref(true)

  // Resolves the first time Firebase tells us the auth state.
  let resolveReady
  const readyPromise = new Promise((r) => (resolveReady = r))

  // ---------- Getters ----------
  const isAuthenticated = computed(() => !!user.value)
  const emailVerified = computed(() => !!user.value?.emailVerified)
  const role = computed(() => profile.value?.role ?? null)

  const isCitizen = computed(() => role.value === ROLES.CITIZEN)
  const isResponder = computed(() => role.value === ROLES.RESPONDER)
  const isAdmin = computed(() => role.value === ROLES.ADMIN)

  // Responders are only "active" once an admin has approved them.
  const isVerifiedResponder = computed(
    () => isResponder.value && profile.value?.status === 'active'
  )

  // A role-agnostic flag: is the current account in good standing?
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

  // Firebase calls this on app start and every login/logout
  onAuthStateChanged(auth, async (fbUser) => {
    user.value = fbUser
    if (fbUser) {
      await loadProfile(fbUser.uid)
    } else {
      profile.value = null
    }
    if (initializing.value) {
      initializing.value = false
      resolveReady() // unblock the router
    }
  })

  function ready() {
    return readyPromise
  }

  // ---------- Actions ----------

  /**
   * Register a new user.
   *
   * Public registration ALWAYS creates a CITIZEN account.
   * A verification email is sent automatically after creation.
   */
  async function register(payload) {
    const { fullName, email, password, phone, termsVersion } = payload

    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName: fullName })

    // Send Firebase's built-in verification email
    try {
      await sendEmailVerification(cred.user)
    } catch (e) {
      // Non-fatal — user can request a resend from the verify screen
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

      termsAccepted: true,
      termsVersion,
      termsAcceptedAt: serverTimestamp(),

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    await setDoc(doc(db, 'users', cred.user.uid), docData)

    // Optimistic local update
    profile.value = { ...docData, createdAt: new Date() }

    return cred.user
  }

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    // Refresh emailVerified from server
    try {
      await cred.user.reload()
    } catch (e) {
      // ignore
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

  /**
   * Resend the verification email to the current user.
   */
  async function resendVerification() {
    if (!user.value) throw new Error('Not signed in')
    await sendEmailVerification(user.value)
  }

  /**
   * Reload the current Firebase user to refresh emailVerified status.
   * Reassigns user.value so Vue reactivity picks up the change.
   */
  async function reloadUser() {
    if (!user.value) return
    await user.value.reload()
    // Firebase's User object mutates in place — reassign to trigger reactivity
    user.value = { ...user.value }
  }

  return {
    // state
    user,
    profile,
    initializing,

    // getters
    isAuthenticated,
    emailVerified,
    isCitizen,
    isResponder,
    isAdmin,
    isVerifiedResponder,
    isActive,
    role,

    // methods
    ready,
    register,
    login,
    logout,
    resetPassword,
    resendVerification,
    reloadUser,
  }
})