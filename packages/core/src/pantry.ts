import { formatDesc } from './text.ts'
import type { ExportRow, Product, ProductData, Session } from './types.ts'

/** Quantity a product had at time `at` (falls back to the current quantity). */
export function quantityAt(p: Pick<ProductData, 'quantity' | 'quantityLog'>, at: number): number {
  let q: number | null = null
  for (const entry of p.quantityLog) {
    if (entry.at <= at) q = entry.quantity
  }
  return q ?? p.quantity
}

/** Products that were in the pantry at time `at`, in insertion order. */
export function pantryAt<T extends ProductData>(products: T[], at: number): T[] {
  return products
    .filter((p) => p.createdAt <= at && (p.consumedAt === null || p.consumedAt > at))
    .sort((a, b) => a.seq - b.seq)
}

/** The moment a session's file describes: its closing time, or now if still open. */
export function sessionSnapshotTime(session: Pick<Session, 'closedAt'>, now = Date.now()): number {
  return session.closedAt ?? now
}

/** Workbook rows for the pantry at time `at`, as in the historical FULL sheet. */
export function pantryRows(products: ProductData[], at: number): ExportRow[] {
  return pantryAt(products, at).map((p) => toRow(p, at))
}

function toRow(p: ProductData, at: number): ExportRow {
  return { tip: p.tip, desc: formatDesc(p.name, quantityAt(p, at)), date: p.expiryDate }
}

/**
 * Rows of a session's file. Imported sessions keep the original row order;
 * products not listed there (none, normally) go at the end in insertion order.
 */
export function sessionRows(products: Product[], session: Pick<Session, 'closedAt' | 'order'>, now = Date.now()): ExportRow[] {
  const at = sessionSnapshotTime(session, now)
  const inPantry = pantryAt(products, at)
  if (!session.order?.length) return inPantry.map((p) => toRow(p, at))
  const rank = new Map(session.order.map((id, i) => [id, i]))
  const sorted = [...inPantry].sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER
    return ra - rb || a.seq - b.seq
  })
  return sorted.map((p) => toRow(p, at))
}

/**
 * True when a session changed nothing: no products added or consumed and no
 * quantity changed since it was opened. Such a session is not recorded.
 */
export function isSessionEmpty(session: Pick<Session, 'addedCount' | 'consumedCount' | 'openedAt'>, activeProducts: ProductData[]): boolean {
  if (session.addedCount > 0 || session.consumedCount > 0) return false
  return !activeProducts.some((p) => p.quantityLog.some((q) => q.at >= session.openedAt))
}
