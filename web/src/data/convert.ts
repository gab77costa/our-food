/** Firestore documents <-> shared types (Timestamp <-> epoch ms). */
import { emptyCounts, isTip, type CategoryHint, type Product, type Session } from '@ourfoodhub/core'
import { Timestamp, type DocumentData } from 'firebase/firestore'

/** Query or document snapshot of an existing document. */
type Snap = { id: string; data(): DocumentData | undefined }

const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null)

export function toProduct(snap: Snap): Product {
  const d = snap.data() ?? {}
  return {
    id: snap.id,
    name: String(d.name ?? ''),
    nameKey: String(d.nameKey ?? ''),
    tip: isTip(d.tip) ? d.tip : null,
    quantity: Number(d.quantity ?? 1),
    quantityLog: Array.isArray(d.quantityLog)
      ? d.quantityLog.map((q: { at: unknown; quantity: unknown }) => ({ at: ms(q.at) ?? 0, quantity: Number(q.quantity) }))
      : [],
    expiryDate: typeof d.expiryDate === 'string' ? d.expiryDate : null,
    status: d.status === 'consumed' ? 'consumed' : 'active',
    seq: Number(d.seq ?? 0),
    sessionId: d.sessionId ?? null,
    // Pending server timestamps read as null locally: treat them as "now".
    createdAt: ms(d.createdAt) ?? Date.now(),
    createdBy: String(d.createdBy ?? ''),
    consumedAt: ms(d.consumedAt),
    consumedInSessionId: d.consumedInSessionId ?? null,
    consumedBy: d.consumedBy ?? null,
  }
}

export function toSession(snap: Snap): Session {
  const d = snap.data() ?? {}
  return {
    id: snap.id,
    date: String(d.date ?? snap.id),
    status: d.status === 'closed' ? 'closed' : 'open',
    openedAt: ms(d.openedAt) ?? Date.now(),
    openedBy: String(d.openedBy ?? ''),
    closedAt: ms(d.closedAt),
    addedCount: Number(d.addedCount ?? 0),
    consumedCount: Number(d.consumedCount ?? 0),
    source: d.source === 'import' ? 'import' : 'app',
    order: Array.isArray(d.order) ? d.order : undefined,
  }
}

export function toHint(snap: Snap): CategoryHint {
  const d = snap.data() ?? {}
  return {
    id: snap.id,
    displayName: String(d.displayName ?? snap.id),
    aliases: Array.isArray(d.aliases) ? d.aliases : [],
    counts: { ...emptyCounts(), ...(d.counts ?? {}) },
    override: isTip(d.override) ? d.override : null,
    lastSeen: ms(d.lastSeen) ?? 0,
    source: d.source === 'user' || d.source === 'llm' ? d.source : 'import',
  }
}
