/**
 * Product types ("tip"), as used in the historical Excel files.
 * The tip is where the product is stored, and it decides the Excel sheet.
 */
export const TIPS = ['v', 'f', 'c', 'd', 'b'] as const
export type Tip = (typeof TIPS)[number]

export const TIP_LABELS: Record<Tip, string> = {
  v: 'Frutta e verdura',
  f: 'Frigorifero',
  c: 'Congelatore',
  d: 'Dispensa',
  b: 'Bevande',
}

/** Chosen to look different from each other even at small sizes. */
export const TIP_ICONS: Record<Tip, string> = {
  v: '🥦',
  f: '🥛',
  c: '❄️',
  d: '🥫',
  b: '🍾',
}

/** Labels short enough for five buttons side by side on a phone. */
export const TIP_SHORT: Record<Tip, string> = {
  v: 'Frutta verdura',
  f: 'Frigo',
  c: 'Freezer',
  d: 'Dispensa',
  b: 'Bevande',
}

/** Sheets of the exported workbook, in order, with the tips each one holds. */
export const SHEETS: ReadonlyArray<{ name: string; tips: readonly Tip[] }> = [
  { name: 'Frutta e verdura', tips: ['v'] },
  { name: 'Congelatore', tips: ['c'] },
  { name: 'Frigorifero', tips: ['f'] },
  { name: 'Dispensa e bevande', tips: ['d', 'b'] },
]
export const FULL_SHEET = 'FULL'

export function isTip(value: unknown): value is Tip {
  return typeof value === 'string' && (TIPS as readonly string[]).includes(value)
}

/** Fruit/vegetables and frozen food don't need an expiry date. */
export function expiryRequired(tip: Tip | null | undefined): boolean {
  return tip !== 'v' && tip !== 'c'
}
