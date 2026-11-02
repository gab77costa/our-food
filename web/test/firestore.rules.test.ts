import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment

const ALLOWED = { email: 'mario@example.com', email_verified: true }
const STRANGER = { email: 'altro@example.com', email_verified: true }

const product = (over: Record<string, unknown> = {}) => ({
  name: 'kefir',
  nameKey: 'kefir',
  tip: 'f',
  quantity: 6,
  quantityLog: [{ at: Timestamp.now(), quantity: 6 }],
  expiryDate: '2026-11-19',
  status: 'active',
  seq: 1,
  sessionId: '2026-10-27',
  createdAt: Timestamp.now(),
  createdBy: 'mario@example.com',
  consumedAt: null,
  consumedInSessionId: null,
  consumedBy: null,
  updatedAt: Timestamp.now(),
  ...over,
})

const session = (over: Record<string, unknown> = {}) => ({
  date: '2026-10-27',
  status: 'open',
  openedAt: Timestamp.now(),
  openedBy: 'mario@example.com',
  closedAt: null,
  addedCount: 0,
  consumedCount: 0,
  source: 'app',
  ...over,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ourfoodhub',
    firestore: { rules: readFileSync(resolve(import.meta.dirname, '../../firestore.rules'), 'utf8') },
  })
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'allowedUsers/mario@example.com'), { email: 'mario@example.com' })
    await setDoc(doc(ctx.firestore(), 'products/p1'), product())
  })
})

afterAll(() => env.cleanup())

const as = (claims: typeof ALLOWED | null, uid = 'u1') => (claims ? env.authenticatedContext(uid, claims).firestore() : env.unauthenticatedContext().firestore())

describe('access', () => {
  it('denies everything to anonymous and to accounts not in the list', async () => {
    await assertFails(getDocs(collection(as(null), 'products')))
    await assertFails(getDocs(collection(as(STRANGER, 'u2'), 'products')))
    await assertFails(setDoc(doc(as(STRANGER, 'u2'), 'products/x'), product()))
  })

  it('denies unverified emails even if listed', async () => {
    await assertFails(getDocs(collection(as({ email: 'mario@example.com', email_verified: false }), 'products')))
  })

  it('lets allowed users read and write', async () => {
    const db = as(ALLOWED)
    await assertSucceeds(getDocs(collection(db, 'products')))
    await assertSucceeds(setDoc(doc(db, 'products/p2'), product()))
    await assertSucceeds(updateDoc(doc(db, 'products/p1'), { status: 'consumed', consumedAt: Timestamp.now() }))
    await assertSucceeds(setDoc(doc(db, 'sessions/2026-10-27'), session()))
  })

  it('lets users check only their own authorization, and nobody edit the list', async () => {
    await assertSucceeds(getDoc(doc(as(STRANGER, 'u2'), 'allowedUsers/altro@example.com')))
    await assertFails(getDoc(doc(as(STRANGER, 'u2'), 'allowedUsers/mario@example.com')))
    await assertFails(setDoc(doc(as(STRANGER, 'u2'), 'allowedUsers/altro@example.com'), { email: 'x' }))
    await assertFails(setDoc(doc(as(ALLOWED), 'allowedUsers/altro@example.com'), { email: 'x' }))
  })
})

describe('validation', () => {
  const db = () => as(ALLOWED)

  it('rejects invalid products', async () => {
    await assertFails(setDoc(doc(db(), 'products/x'), product({ tip: 'z' })))
    await assertFails(setDoc(doc(db(), 'products/x'), product({ quantity: 0 })))
    await assertFails(setDoc(doc(db(), 'products/x'), product({ expiryDate: '19/11/2026' })))
    await assertFails(setDoc(doc(db(), 'products/x'), product({ status: 'wasted' })))
    await assertFails(setDoc(doc(db(), 'products/x'), product({ extra: true })))
  })

  it('accepts products still to categorize', async () => {
    await assertSucceeds(setDoc(doc(db(), 'products/x'), product({ tip: null })))
  })

  it('requires the session id to be its date', async () => {
    await assertFails(setDoc(doc(db(), 'sessions/oggi'), session({ date: 'oggi' })))
    await assertFails(setDoc(doc(db(), 'sessions/2026-10-28'), session()))
  })

  it('deletes only empty sessions', async () => {
    await assertSucceeds(setDoc(doc(db(), 'sessions/2026-10-27'), session({ addedCount: 3 })))
    await assertFails(deleteDoc(doc(db(), 'sessions/2026-10-27')))
    await assertSucceeds(setDoc(doc(db(), 'sessions/2026-10-27'), session()))
    await assertSucceeds(deleteDoc(doc(db(), 'sessions/2026-10-27')))
  })

  it('validates learned names', async () => {
    const hint = { displayName: 'kefir', aliases: [], counts: { f: 1 }, override: null, lastSeen: Timestamp.now(), source: 'user' }
    await assertSucceeds(setDoc(doc(db(), 'categoryHints/kefir'), hint))
    await assertFails(setDoc(doc(db(), 'categoryHints/kefir'), { ...hint, counts: { x: 1 } }))
    await assertFails(setDoc(doc(db(), 'categoryHints/kefir'), { ...hint, override: 'z' }))
  })
})
