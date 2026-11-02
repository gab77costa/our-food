/** Lowercase, no accents, single spaces, no stray punctuation. Used as lookup key. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** How product names are stored: lowercase like the historical files, accents kept. */
export function cleanName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
}

/** Firestore document ids can't contain "/" and must not be empty. */
export function nameKeyToDocId(key: string): string {
  return key.replace(/\//g, '_') || '_'
}

/** First letter uppercase, as shown in the UI. */
export function displayCase(name: string): string {
  const t = name.trim().replace(/\s+/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Italian number words 1..31 (enough for days and quantities). */
export const NUMBER_WORDS: Record<string, number> = {
  uno: 1, una: 1, un: 1, primo: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7,
  otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12, tredici: 13, quattordici: 14,
  quindici: 15, sedici: 16, diciassette: 17, diciotto: 18, diciannove: 19, venti: 20,
  ventuno: 21, ventidue: 22, ventitre: 23, ventitré: 23, ventiquattro: 24, venticinque: 25,
  ventisei: 26, ventisette: 27, ventotto: 28, ventinove: 29, trenta: 30, trentuno: 31,
}

export function parseSmallNumber(token: string): number | null {
  const t = token.toLowerCase().replace(/[°º]$/, '')
  if (/^\d{1,3}$/.test(t)) return parseInt(t, 10)
  return NUMBER_WORDS[t] ?? null
}

/**
 * "kefir x6" -> { name: "kefir", quantity: 6 }. The historical files keep the
 * quantity at the end of the description; without it the quantity is 1.
 */
export function splitQuantity(desc: string): { name: string; quantity: number } {
  const m = desc.trim().match(/^(.*?)\s*x\s*(\d{1,3})$/i)
  if (m && m[1]) {
    const q = parseInt(m[2]!, 10)
    if (q > 0) return { name: m[1].trim(), quantity: q }
  }
  return { name: desc.trim(), quantity: 1 }
}

/** Inverse of splitQuantity, used for the Excel "desc" column. */
export function formatDesc(name: string, quantity: number): string {
  return quantity > 1 ? `${name} x${quantity}` : name
}
