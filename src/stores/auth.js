import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
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

  // Resolves the first time Firebase tells us the auth state. The router
  // awaits this so we don't flash the login page while Firebase is still
  // restoring a session from localStorage.
  let resolveReady
  const readyPromise = new Promise((r) => (resolveReady = r))

  // ---------- Getters ----------
  const isAuthenticated = computed(() => !!user.value)
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

  // Firebase calls this:
  //   - once on app start (null or a cached user)
  //   - again on every login / logout
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
   * Responder and admin accounts are provisioned manually by
   * administrators (Firebase Console now, admin panel later).
   *
   * @param {Object} payload
   * @param {string} payload.fullName
   * @param {string} payload.email
   * @param {string} payload.password
   * @param {string} [payload.phone]
   * @param {string} payload.termsVersion  - which T&C version they accepted
   */
  async function register(payload) {
    const { fullName, email, password, phone, termsVersion } = payload

    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName: fullName })

    const docData = {
      uid: cred.user.uid,
      fullName,
      email: email.toLowerCase(),
      phone: phone || '',
      role: ROLES.CITIZEN, // always citizen

      // Responder-only fields — null for citizens
      agency: null,
      badgeId: null,

      // Citizens are active immediately
      status: 'active',

      // Legal acceptance audit trail
      termsAccepted: true,
      termsVersion,
      termsAcceptedAt: serverTimestamp(),

      // Timestamps
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    await setDoc(doc(db, 'users', cred.user.uid), docData)

    // Optimistic local update so the dashboard has data immediately
    profile.value = { ...docData, createdAt: new Date() }

    return cred.user
  }

  async function login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password)
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

  return {
    // state
    user,
    profile,
    initializing,

    // getters
    isAuthenticated,
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
  }
})