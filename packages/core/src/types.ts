import type { Tip } from './tips.ts'

/** ISO date without time, e.g. "2026-10-21". */
export type IsoDate = string

export interface QuantityChange {
  /** Epoch milliseconds. */
  at: number
  quantity: number
}

/**
 * Product as seen by the shared logic. Timestamps are epoch milliseconds;
 * the Firestore layer converts them to/from Timestamp.
 */
export interface ProductData {
  name: string
  /** normalizeName(name), used for lookups. */
  nameKey: string
  /** null = still to categorize (saved offline without a suggestion). */
  tip: Tip | null
  quantity: number
  /** Quantity over time, so that past session files can be rebuilt exactly. */
  quantityLog: QuantityChange[]
  expiryDate: IsoDate | null
  status: 'active' | 'consumed'
  /** Insertion order, used to keep the row order of the Excel files. */
  seq: number
  sessionId: string | null
  createdAt: number
  createdBy: string
  consumedAt: number | null
  consumedInSessionId: string | null
  consumedBy: string | null
}

export interface Product extends ProductData {
  id: string
}

export interface SessionData {
  /** Same as the document id: one session per day. */
  date: IsoDate
  status: 'open' | 'closed'
  openedAt: number
  openedBy: string
  closedAt: number | null
  addedCount: number
  consumedCount: number
  source: 'app' | 'import'
  /**
   * Only for imported sessions: product ids in the row order of the original
   * FULL sheet, so the file can be rebuilt exactly as it was.
   */
  order?: string[]
}

export interface Session extends SessionData {
  id: string
}

export interface CategoryHintData {
  displayName: string
  /** Normalized alternative spellings (abbreviations, typos, plurals). */
  aliases: string[]
  counts: Record<Tip, number>
  /** Set by a manual correction; always wins over counts. */
  override: Tip | null
  lastSeen: number
  source: 'import' | 'user' | 'llm'
}

export interface CategoryHint extends CategoryHintData {
  /** normalizeName(displayName) */
  id: string
}

/** One row of an imported workbook. */
export interface SheetRow {
  tip: Tip
  desc: string
  date: IsoDate | null
}

/** One row of an exported workbook: products still to categorize have no tip (FULL only). */
export interface ExportRow {
  tip: Tip | null
  desc: string
  date: IsoDate | null
}
