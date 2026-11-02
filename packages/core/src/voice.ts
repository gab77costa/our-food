import { findSpokenDate } from './dates.ts'
import { cleanName, NUMBER_WORDS, parseSmallNumber } from './text.ts'
import type { IsoDate } from './types.ts'

export interface ParsedUtterance {
  name: string
  quantity: number
  expiryDate: IsoDate | null
  /** True when the words looked like a date that doesn't exist (e.g. "31 settembre"). */
  invalidDate: boolean
  raw: string
}

const QTY_WORD = `(\\d{1,3}|${Object.keys(NUMBER_WORDS).join('|')})`
const UNITS = '(?:pezzi|pezzo|confezioni|confezione|vasetti|vasetto|bottiglie|bottiglia|scatolette|scatoletta|scatole|scatola|barattoli|barattolo|buste|busta|pacchi|pacco|pacchetti|pacchetto|lattine|lattina|brick|uova)'
// "kefir x 6", "kefir per 6", "kefir 6 pezzi", "kefir sei vasetti", "pere abate quattro"
const RE_QTY_SUFFIX = new RegExp(`(?:\\s+(?:x|per|quantità|quantita)\\s*${QTY_WORD}|\\s+${QTY_WORD}(?:\\s+${UNITS})?)\\s*$`, 'i')
// "sei yogurt", "2 mozzarelle" at the start of the phrase
const RE_QTY_PREFIX = new RegExp(`^${QTY_WORD}\\s+(?:${UNITS}\\s+(?:di\\s+)?)?(?=\\S)`, 'i')
// Leading words people say before the product name.
const RE_LEADING_FILLER = /^(?:(?:ho|abbiamo|aggiungi|inserisci|metti|poi|e|ancora|anche|il|lo|la|i|gli|le|un|uno|una)\s+)+/i
const RE_TRAILING_FILLER = /\s+(?:che\s+)?(?:scade|scadono|scadenza|con\s+scadenza|entro)$/i

/**
 * One dictated phrase = one product: "yogurt greco 3 ottobre 2026",
 * "sei kefir scade 19 novembre", "pere abate quattro pezzi".
 * Everything that is not the date or the quantity is the product name.
 */
export function parseUtterance(raw: string, today: IsoDate): ParsedUtterance {
  let text = raw.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '')

  let expiryDate: IsoDate | null = null
  let invalidDate = false
  const dm = findSpokenDate(text, today)
  if (dm) {
    expiryDate = dm.date
    invalidDate = dm.date === null
    text = `${text.slice(0, dm.index)} ${text.slice(dm.index + dm.length)}`.trim()
  }

  text = text.replace(RE_TRAILING_FILLER, '').trim()

  let quantity = 1
  const suffix = RE_QTY_SUFFIX.exec(text)
  if (suffix) {
    const n = parseSmallNumber(suffix[1] ?? suffix[2] ?? '')
    if (n && n > 0) {
      quantity = n
      text = text.slice(0, suffix.index).trim()
    }
  } else {
    const withoutFiller = text.replace(RE_LEADING_FILLER, '')
    const prefix = RE_QTY_PREFIX.exec(withoutFiller)
    // "un/una/uno" is an article, not a quantity worth recording.
    if (prefix && !/^(?:un|uno|una)$/i.test(prefix[1]!)) {
      const n = parseSmallNumber(prefix[1]!)
      if (n && n > 0) {
        quantity = n
        text = withoutFiller.slice(prefix[0].length)
      }
    }
  }

  text = text.replace(RE_LEADING_FILLER, '').replace(RE_TRAILING_FILLER, '')
  return { name: cleanName(text), quantity, expiryDate, invalidDate, raw }
}
