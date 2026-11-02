/**
 * Rebuilds sessions and products from the historical files. Each file is a
 * snapshot of the pantry after a grocery trip: a product is "the same" across
 * consecutive files when tip, name (without "xN") and expiry date match.
 */
import { normalizeName, splitQuantity } from './text.ts'
import type { IsoDate, Product, Session, SheetRow } from './types.ts'

export interface Snapshot {
  date: IsoDate
  /** Rows of the FULL sheet, in file order. */
  rows: SheetRow[]
}

export interface ReconstructOptions {
  /** Maps an original (normalized) name to its canonical name. Default: unchanged. */
  canonical?: (originalName: string) => string
  createdBy?: string
}

export interface Reconstruction {
  sessions: Session[]
  products: Product[]
  stats: {
    snapshots: number
    rows: number
    products: number
    active: number
    consumed: number
    quantityChanges: number
  }
}

/** Times used for imported sessions (device local time): opened 09:00, closed 20:00. */
export function importTimes(date: IsoDate): { openedAt: number; closedAt: number } {
  const y = +date.slice(0, 4), m = +date.slice(5, 7) - 1, d = +date.slice(8, 10)
  return { openedAt: new Date(y, m, d, 9).getTime(), closedAt: new Date(y, m, d, 20).getTime() }
}

export function reconstructHistory(snapshots: Snapshot[], options: ReconstructOptions = {}): Reconstruction {
  const canonical = options.canonical ?? ((n: string) => n)
  const createdBy = options.createdBy ?? 'import'
  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i]!.date === ordered[i - 1]!.date) throw new Error(`Due file con la stessa data: ${ordered[i]!.date}`)
  }

  const products: Product[] = []
  const sessions: Session[] = []
  /** Active products grouped by identity key, oldest first. */
  let active = new Map<string, Product[]>()
  let rowsTotal = 0
  let quantityChanges = 0

  ordered.forEach((snap, si) => {
    const { openedAt, closedAt } = importTimes(snap.date)
    const nextActive = new Map<string, Product[]>()
    const order: string[] = []
    let added = 0

    snap.rows.forEach((row, ri) => {
      rowsTotal++
      const { name: originalName, quantity } = splitQuantity(row.desc)
      const name = canonical(normalizeName(originalName)) || normalizeName(originalName)
      const key = `${row.tip}|${normalizeName(name)}|${row.date ?? ''}`

      const carried = active.get(key)?.shift()
      let product: Product
      if (carried) {
        product = carried
        if (product.quantity !== quantity) {
          product.quantity = quantity
          product.quantityLog.push({ at: openedAt, quantity })
          quantityChanges++
        }
      } else {
        product = {
          id: `imp-${snap.date}-${String(ri + 1).padStart(3, '0')}`,
          name,
          nameKey: normalizeName(name),
          tip: row.tip,
          quantity,
          quantityLog: [{ at: openedAt, quantity }],
          expiryDate: row.date,
          status: 'active',
          seq: si * 1000 + ri,
          sessionId: snap.date,
          createdAt: openedAt,
          createdBy,
          consumedAt: null,
          consumedInSessionId: null,
          consumedBy: null,
        }
        products.push(product)
        added++
      }
      order.push(product.id)
      const list = nextActive.get(key) ?? []
      list.push(product)
      nextActive.set(key, list)
    })

    // Whatever was in the previous file and is missing now was consumed in this session.
    let consumed = 0
    for (const leftovers of active.values()) {
      for (const p of leftovers) {
        p.status = 'consumed'
        p.consumedAt = openedAt
        p.consumedInSessionId = snap.date
        p.consumedBy = createdBy
        consumed++
      }
    }
    active = nextActive

    sessions.push({
      id: snap.date,
      date: snap.date,
      status: 'closed',
      openedAt,
      openedBy: createdBy,
      closedAt,
      addedCount: added,
      consumedCount: consumed,
      source: 'import',
      order,
    })
  })

  const activeCount = products.filter((p) => p.status === 'active').length
  return {
    sessions,
    products,
    stats: {
      snapshots: ordered.length,
      rows: rowsTotal,
      products: products.length,
      active: activeCount,
      consumed: products.length - activeCount,
      quantityChanges,
    },
  }
}
