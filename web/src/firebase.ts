import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

const env = import.meta.env
const useEmulators = env.VITE_USE_EMULATORS === 'true'

/** false = never call the AI: unknown names stay to be categorized by hand. */
export const aiEnabled = env.VITE_AI_ENABLED !== 'false'

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'ourfoodhub',
  appId: env.VITE_FIREBASE_APP_ID,
})

export const auth = getAuth(app)
auth.languageCode = 'it'

// Offline cache: products can be added and consumed without network; they sync later.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

export const functions = getFunctions(app, env.VITE_FUNCTIONS_REGION || 'europe-west8')

if (useEmulators) {
  const host = location.hostname
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
  connectFunctionsEmulator(functions, host, 5001)
}
