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
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  collection,
  addDoc,
} from 'firebase/firestore'
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

  /**
   * Write an auth event to the system_logs audit trail.
   * Never throws — logging must not break sign-in/out flows.
   */
  async function writeAuthLog({
    level = 'info',
    action,
    message,
    uid = null,
    email = null,
    name = null,
    role = null,
  }) {
    try {
      await addDoc(collection(db, 'system_logs'), {
        timestamp: serverTimestamp(),
        level,
        category: 'auth',
        action,
        message,
        actor: uid ? { uid, email, name, role } : null,
        target: uid ? { type: 'user', id: uid } : null,
        metadata: {},
        userAgent: navigator.userAgent.slice(0, 250),
      })
    } catch (e) {
      console.warn('[auth] log write failed', e)
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

    // Audit trail — new citizen registered
    await writeAuthLog({
      level: 'success',
      action: 'auth.register',
      message: `New citizen registered: ${email}`,
      uid: cred.user.uid,
      email: cred.user.email,
      name: fullName,
      role: ROLES.CITIZEN,
    })

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

    // Audit trail — successful sign-in
    await writeAuthLog({
      level: 'success',
      action: 'auth.login',
      message: `User signed in: ${email}`,
      uid: cred.user.uid,
      email: cred.user.email,
      name: profile.value?.fullName || null,
      role: profile.value?.role || null,
    })

    return cred.user
  }

  async function logout() {
    // Capture identity BEFORE signOut clears it
    const _uid = user.value?.uid
    const _email = user.value?.email
    const _name = profile.value?.fullName || null
    const _role = profile.value?.role || null

    // Audit trail — sign-out (best effort, before actual signOut)
    if (_uid) {
      await writeAuthLog({
        level: 'info',
        action: 'auth.logout',
        message: `User signed out: ${_email || 'unknown'}`,
        uid: _uid,
        email: _email,
        name: _name,
        role: _role,
      })
    }

    await signOut(auth)
    user.value = null
    profile.value = null
  }

  async function resetPassword(email) {
    await sendPasswordResetEmail(auth, email)

    await writeAuthLog({
      level: 'info',
      action: 'auth.password_reset_requested',
      message: `Password reset requested for: ${email}`,
      email,
    })
  }

  async function resendVerification() {
    if (!user.value) throw new Error('Not signed in')
    await sendEmailVerification(user.value)

    await writeAuthLog({
      level: 'info',
      action: 'auth.verification_resent',
      message: `Verification email resent to: ${user.value.email}`,
      uid: user.value.uid,
      email: user.value.email,
      name: profile.value?.fullName || null,
      role: profile.value?.role || null,
    })
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

    const _uid = user.value.uid
    const _oldEmail = user.value.email
    const _name = profile.value?.fullName || null

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

    // Audit trail — responder completed account setup
    await writeAuthLog({
      level: 'success',
      action: 'auth.setup_completed',
      message: `Responder completed account setup: ${_oldEmail} → ${newEmail}`,
      uid: _uid,
      email: newEmail,
      name: _name,
      role: ROLES.RESPONDER,
    })
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