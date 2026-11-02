import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { auth, db } from './firebase'

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'notAllowed'; user: User }
  | { status: 'allowed'; user: User }

const AuthContext = createContext<AuthState>({ status: 'loading' })

/** Whether the account is in allowedUsers. Rules let each user read only their own entry. */
async function isAllowed(user: User): Promise<boolean> {
  if (!user.email) return false
  try {
    const snap = await getDoc(doc(db, 'allowedUsers', user.email.toLowerCase()))
    return snap.exists()
  } catch {
    return false
  }
}

const ALLOWED_CACHE = 'ofh-allowed'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          setState({ status: 'signedOut' })
          return
        }
        // Offline start: trust the last successful check for this account.
        if (!navigator.onLine && readCache() === user.uid) {
          setState({ status: 'allowed', user })
          return
        }
        const ok = await isAllowed(user)
        writeCache(ok ? user.uid : null)
        setState(ok ? { status: 'allowed', user } : { status: 'notAllowed', user })
      }),
    [],
  )

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

function readCache(): string | null {
  try {
    return localStorage.getItem(ALLOWED_CACHE)
  } catch {
    return null
  }
}
function writeCache(uid: string | null) {
  try {
    if (uid) localStorage.setItem(ALLOWED_CACHE, uid)
    else localStorage.removeItem(ALLOWED_CACHE)
  } catch {
    // storage unavailable: only offline start is affected
  }
}

export function useAuth() {
  return useContext(AuthContext)
}

/** The signed-in, allowed user (only inside protected pages). */
export function useUser(): User {
  const s = useAuth()
  if (s.status !== 'allowed') throw new Error('useUser outside an authorized page')
  return s.user
}

export async function signIn() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await signInWithPopup(auth, provider)
  } catch (e) {
    const code = (e as { code?: string }).code
    // Installed app or blocked popups: fall back to a full-page redirect.
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider)
    } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      throw e
    }
  }
}

export function signOut() {
  writeCache(null)
  return fbSignOut(auth)
}
