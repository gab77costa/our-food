/**
 * Writes the import to Firestore with the Admin SDK (bypasses security rules).
 * Target: the cloud project by default, the local emulator with --emulator.
 */
import { initializeApp, applicationDefault, type App } from 'firebase-admin/app'
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore'
import { nameKeyToDocId, type CategoryHint, type Product, type Session } from '@ourfoodhub/core'

export interface Target {
  project: string
  emulator: boolean
}

export function connect(target: Target): Firestore {
  if (target.emulator) {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
  } else {
    delete process.env.FIRESTORE_EMULATOR_HOST
  }
  const app: App = initializeApp(
    target.emulator ? { projectId: target.project } : { projectId: target.project, credential: applicationDefault() },
  )
  return getFirestore(app)
}

const ts = (ms: number | null) => (ms === null ? null : Timestamp.fromMillis(ms))

export function productDoc(p: Product) {
  const { id: _id, ...data } = p
  return {
    ...data,
    quantityLog: p.quantityLog.map((q) => ({ at: Timestamp.fromMillis(q.at), quantity: q.quantity })),
    createdAt: Timestamp.fromMillis(p.createdAt),
    consumedAt: ts(p.consumedAt),
    updatedAt: Timestamp.fromMillis(p.consumedAt ?? p.createdAt),
  }
}

export function sessionDoc(s: Session) {
  const { id: _id, ...data } = s
  return { ...data, openedAt: Timestamp.fromMillis(s.openedAt), closedAt: ts(s.closedAt) }
}

export function hintDoc(h: CategoryHint) {
  const { id: _id, ...data } = h
  return { ...data, lastSeen: Timestamp.fromMillis(h.lastSeen) }
}

export async function existingCounts(db: Firestore) {
  const [products, sessions, hints] = await Promise.all(
    ['products', 'sessions', 'categoryHints'].map((c) => db.collection(c).limit(1).get()),
  )
  return { products: products!.size, sessions: sessions!.size, hints: hints!.size }
}

export async function writeImport(db: Firestore, data: { sessions: Session[]; products: Product[]; hints: CategoryHint[] }) {
  const writer = db.bulkWriter()
  let errors = 0
  writer.onWriteError((e) => {
    errors++
    console.error(`  errore su ${e.documentRef.path}: ${e.message}`)
    return false
  })
  for (const s of data.sessions) writer.set(db.doc(`sessions/${s.id}`), sessionDoc(s))
  for (const p of data.products) writer.set(db.doc(`products/${p.id}`), productDoc(p))
  for (const h of data.hints) writer.set(db.doc(`categoryHints/${nameKeyToDocId(h.id)}`), hintDoc(h))
  await writer.close()
  if (errors) throw new Error(`${errors} scritture fallite`)
}

export async function allowUser(db: Firestore, email: string) {
  const id = email.trim().toLowerCase()
  await db.doc(`allowedUsers/${id}`).set({ email: id, addedAt: Timestamp.now() })
  return id
}
