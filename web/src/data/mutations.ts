/**
 * All writes. Client timestamps (not serverTimestamp) keep the pantry history
 * consistent while offline: writes are queued and synced later.
 */
import {
  cleanName,
  emptyCounts,
  hintTip,
  nameKeyToDocId,
  normalizeName,
  type CategoryHint,
  type HintIndex,
  type IsoDate,
  type Product,
  type Session,
  type Tip,
} from '@ourfoodhub/core'
import type { User } from 'firebase/auth'
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  increment,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'

const who = (u: User) => u.email ?? u.uid

// ── Sessions ─────────────────────────────────────────────────────────────────

/** Opens today's session, or reopens it if it was already closed today. */
export async function openSession(today: IsoDate, existing: Session | null, user: User) {
  const ref = doc(db, 'sessions', today)
  if (existing) return updateDoc(ref, { status: 'open', closedAt: null })
  return setDoc(ref, {
    date: today,
    status: 'open',
    openedAt: Timestamp.now(),
    openedBy: who(user),
    closedAt: null,
    addedCount: 0,
    consumedCount: 0,
    source: 'app',
  })
}

export function closeSession(sessionId: string) {
  return updateDoc(doc(db, 'sessions', sessionId), { status: 'closed', closedAt: Timestamp.now() })
}

/** An empty session is not recorded: it is removed instead of closed. */
export function discardSession(sessionId: string) {
  return deleteDoc(doc(db, 'sessions', sessionId))
}

// ── Consumption ──────────────────────────────────────────────────────────────

export function consumeProducts(products: Product[], sessionId: string | null, user: User) {
  const batch = writeBatch(db)
  const now = Timestamp.now()
  for (const p of products) {
    batch.update(doc(db, 'products', p.id), {
      status: 'consumed',
      consumedAt: now,
      consumedInSessionId: sessionId,
      consumedBy: who(user),
      updatedAt: now,
    })
  }
  if (sessionId) batch.update(doc(db, 'sessions', sessionId), { consumedCount: increment(products.length) })
  return batch.commit()
}

export function restoreProducts(products: Product[]) {
  const batch = writeBatch(db)
  for (const p of products) {
    batch.update(doc(db, 'products', p.id), {
      status: 'active',
      consumedAt: null,
      consumedInSessionId: null,
      consumedBy: null,
      updatedAt: Timestamp.now(),
    })
    if (p.consumedInSessionId) batch.update(doc(db, 'sessions', p.consumedInSessionId), { consumedCount: increment(-1) })
  }
  return batch.commit()
}

// ── New products from a session ──────────────────────────────────────────────

export type TipSource = 'history' | 'similar' | 'keyword' | 'llm' | 'manual'

export interface Draft {
  key: string
  raw: string
  name: string
  quantity: number
  expiryDate: IsoDate | null
  invalidDate: boolean
  tip: Tip | null
  tipSource: TipSource | null
}

/**
 * Learned names: one increment per saved product. A manual choice that
 * disagrees with what the history says becomes an override.
 */
function learn(batch: WriteBatch, index: HintIndex, entries: Array<{ name: string; tip: Tip; source: TipSource | null }>) {
  const now = Timestamp.now()
  const grouped = new Map<string, { name: string; tips: Tip[]; manual: Tip | null; llm: boolean }>()
  for (const e of entries) {
    const key = normalizeName(e.name)
    if (!key) continue
    const g = grouped.get(key) ?? { name: cleanName(e.name), tips: [], manual: null, llm: false }
    g.tips.push(e.tip)
    if (e.source === 'manual') g.manual = e.tip
    if (e.source === 'llm') g.llm = true
    grouped.set(key, g)
  }
  for (const [key, g] of grouped) {
    const existing = index.byKey.get(key)
    if (existing) {
      const update: Record<string, unknown> = { lastSeen: now }
      for (const t of g.tips) update[`counts.${t}`] = increment(g.tips.filter((x) => x === t).length)
      if (g.manual && g.manual !== hintTip(existing)) update.override = g.manual
      batch.update(doc(db, 'categoryHints', existing.id), update)
    } else {
      const counts = emptyCounts()
      for (const t of g.tips) counts[t]++
      batch.set(doc(db, 'categoryHints', nameKeyToDocId(key)), {
        displayName: g.name,
        aliases: [],
        counts,
        override: null,
        lastSeen: now,
        source: g.llm ? 'llm' : 'user',
      })
    }
  }
}

export async function saveDrafts(sessionId: string, drafts: Draft[], user: User, index: HintIndex) {
  const batch = writeBatch(db)
  const now = Timestamp.now()
  const base = now.toMillis() * 100
  drafts.forEach((d, i) => {
    const name = cleanName(d.name)
    batch.set(doc(collection(db, 'products')), {
      name,
      nameKey: normalizeName(name),
      tip: d.tip,
      quantity: d.quantity,
      quantityLog: [{ at: now, quantity: d.quantity }],
      expiryDate: d.expiryDate,
      status: 'active',
      seq: base + i,
      sessionId,
      createdAt: now,
      createdBy: who(user),
      consumedAt: null,
      consumedInSessionId: null,
      consumedBy: null,
      updatedAt: now,
    })
  })
  learn(
    batch,
    index,
    drafts.filter((d) => d.tip).map((d) => ({ name: d.name, tip: d.tip!, source: d.tipSource })),
  )
  batch.update(doc(db, 'sessions', sessionId), { addedCount: increment(drafts.length) })
  await batch.commit()
}

// ── Management ───────────────────────────────────────────────────────────────

export interface ProductChanges {
  name?: string
  tip?: Tip | null
  quantity?: number
  expiryDate?: IsoDate | null
}

export async function updateProduct(p: Product, changes: ProductChanges, index: HintIndex) {
  const batch = writeBatch(db)
  const now = Timestamp.now()
  const update: Record<string, unknown> = { updatedAt: now }
  if (changes.name !== undefined) {
    update.name = cleanName(changes.name)
    update.nameKey = normalizeName(changes.name)
  }
  if (changes.expiryDate !== undefined) update.expiryDate = changes.expiryDate
  if (changes.quantity !== undefined && changes.quantity !== p.quantity) {
    update.quantity = changes.quantity
    update.quantityLog = arrayUnion({ at: now, quantity: changes.quantity })
  }
  if (changes.tip !== undefined && changes.tip !== p.tip) {
    update.tip = changes.tip
    // A tip chosen by hand is a correction: remember it for this name.
    if (changes.tip) learn(batch, index, [{ name: changes.name ?? p.name, tip: changes.tip, source: 'manual' }])
  }
  batch.update(doc(db, 'products', p.id), update)
  await batch.commit()
}

export function updateProducts(products: Product[], changes: ProductChanges, index: HintIndex) {
  return Promise.all(products.map((p) => updateProduct(p, changes, index)))
}

/** Only for products entered by mistake (consumed products are kept as history). */
export async function deleteProducts(products: Product[]) {
  const batch = writeBatch(db)
  for (const p of products) {
    batch.delete(doc(db, 'products', p.id))
    if (p.sessionId && p.status === 'active') batch.update(doc(db, 'sessions', p.sessionId), { addedCount: increment(-1) })
  }
  await batch.commit()
}

export function setHintOverride(hint: CategoryHint, tip: Tip | null) {
  return updateDoc(doc(db, 'categoryHints', hint.id), { override: tip })
}

export function renameHint(hint: CategoryHint, displayName: string) {
  const name = cleanName(displayName)
  const oldKey = normalizeName(hint.displayName)
  const aliases = hint.aliases.includes(oldKey) || oldKey === normalizeName(name) ? hint.aliases : [...hint.aliases, oldKey]
  return updateDoc(doc(db, 'categoryHints', hint.id), { displayName: name, aliases })
}

export function deleteHint(hint: CategoryHint) {
  return deleteDoc(doc(db, 'categoryHints', hint.id))
}

// ── AI categorization (only for names the history doesn't know) ─────────────

const categorizeFn = httpsCallable<{ names: string[] }, { results: Array<{ name: string; tip: Tip | null }> }>(
  functions,
  'categorizeProducts',
)

export async function categorizeWithAi(names: string[]): Promise<Map<string, Tip>> {
  const res = await categorizeFn({ names })
  const out = new Map<string, Tip>()
  for (const r of res.data.results) if (r.tip) out.set(r.name, r.tip)
  return out
}
