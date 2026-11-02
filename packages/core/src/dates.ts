import { NUMBER_WORDS } from './text.ts'
import type { IsoDate } from './types.ts'

export const MONTHS = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
] as const

const pad = (n: number) => String(n).padStart(2, '0')

export function toIsoDate(y: number, m: number, d: number): IsoDate {
  return `${y}-${pad(m)}-${pad(d)}`
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function isValidIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const y = +m[1]!, mo = +m[2]!, d = +m[3]!
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo)
}

/** Today in the device's local time zone (never UTC). */
export function localToday(now: Date = new Date()): IsoDate {
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** Whole days from `today` to `date` (negative = expired). */
export function daysUntil(date: IsoDate, today: IsoDate): number {
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))
  const b = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

export type ExpiryStatus = 'expired' | 'soon' | 'ok' | 'none'

export function expiryStatus(date: IsoDate | null, today: IsoDate, soonDays = 7): ExpiryStatus {
  if (!date) return 'none'
  const d = daysUntil(date, today)
  if (d < 0) return 'expired'
  if (d <= soonDays) return 'soon'
  return 'ok'
}

/** Excel serial date (1900 system) <-> ISO date. */
export function excelSerialToIso(serial: number): IsoDate {
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000
  const d = new Date(ms)
  return toIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** Dates farther than this are "long shelf life" placeholders (e.g. 2050-12-31). */
export function isLongShelfLife(date: IsoDate | null, today: IsoDate): boolean {
  return !!date && daysUntil(date, today) > 365 * 10
}

// ── Spoken date parsing ──────────────────────────────────────────────────────

export interface DateMatch {
  /** Parsed date, or null when the words looked like a date that doesn't exist. */
  date: IsoDate | null
  /** Position of the matched text (including filler words like "scade il"). */
  index: number
  length: number
  text: string
}

const DAY_WORDS = Object.keys(NUMBER_WORDS).filter((w) => NUMBER_WORDS[w]! <= 31)
const DAY = `(\\d{1,2}|${DAY_WORDS.join('|')})(?:°|º)?`
const MONTH = `(${MONTHS.join('|')})`
const YEAR = `(\\d{4}|\\d{2})`
// Words people put before a date: "scade il", "scadenza", "entro il", "fino al".
const LEAD = `(?:(?:scade|scadono|scadenza|entro|fino|al|il|del|data)\\s+)*`
const SEP = `(?:\\s+(?:del\\s+|dell'\\s*)?)`

const RE_DAY_MONTH_YEAR = new RegExp(`${LEAD}\\b${DAY}\\s+${MONTH}(?:${SEP}${YEAR})?\\b`, 'gi')
const RE_MONTH_YEAR = new RegExp(`${LEAD}\\b${MONTH}${SEP}${YEAR}\\b`, 'gi')
const RE_NUMERIC = new RegExp(`${LEAD}\\b(\\d{1,2})[/.\\-](\\d{1,2})(?:[/.\\-](\\d{4}|\\d{2}))?\\b`, 'gi')
const RE_YEAR_ONLY = new RegExp(`${LEAD}\\b(20\\d{2})\\s*$`, 'gi')

function toDay(token: string): number {
  const t = token.toLowerCase()
  return /^\d+$/.test(t) ? parseInt(t, 10) : NUMBER_WORDS[t] ?? NaN
}

function toYear(token: string | undefined, currentYear: number): number {
  if (!token) return currentYear
  const n = parseInt(token, 10)
  return token.length === 2 ? 2000 + n : n
}

function build(y: number, m: number, d: number): IsoDate | null {
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= daysInMonth(y, m))) return null
  return toIsoDate(y, m, d)
}

function lastMatch(re: RegExp, text: string): RegExpExecArray | null {
  re.lastIndex = 0
  let last: RegExpExecArray | null = null
  for (let m = re.exec(text); m; m = re.exec(text)) last = m
  return last
}

/**
 * Finds the expiry date in a dictated phrase. Rules agreed with the user:
 * - day + month + year: that day ("3 ottobre 2026", "3/10/26");
 * - day + month without year: current year;
 * - month + year: last day of the month ("maggio 2027");
 * - year alone at the end: 31 December ("tonno 2050").
 * When several dates appear, the last one wins (the date usually ends the phrase).
 */
export function findSpokenDate(text: string, today: IsoDate): DateMatch | null {
  const currentYear = +today.slice(0, 4)
  const candidates: Array<{ m: RegExpExecArray; date: IsoDate | null }> = []

  const dmy = lastMatch(RE_DAY_MONTH_YEAR, text)
  if (dmy) {
    const month = MONTHS.indexOf(dmy[2]!.toLowerCase() as (typeof MONTHS)[number]) + 1
    candidates.push({ m: dmy, date: build(toYear(dmy[3], currentYear), month, toDay(dmy[1]!)) })
  }
  const my = lastMatch(RE_MONTH_YEAR, text)
  if (my) {
    const month = MONTHS.indexOf(my[1]!.toLowerCase() as (typeof MONTHS)[number]) + 1
    const year = toYear(my[2], currentYear)
    candidates.push({ m: my, date: build(year, month, daysInMonth(year, month)) })
  }
  const num = lastMatch(RE_NUMERIC, text)
  if (num) {
    candidates.push({ m: num, date: build(toYear(num[3], currentYear), +num[2]!, +num[1]!) })
  }
  const yo = lastMatch(RE_YEAR_ONLY, text)
  if (yo) candidates.push({ m: yo, date: toIsoDate(+yo[1]!, 12, 31) })

  if (!candidates.length) return null
  // Prefer the match that ends last; on ties, the longest (most specific) one.
  candidates.sort((a, b) => {
    const endA = a.m.index + a.m[0].length
    const endB = b.m.index + b.m[0].length
    return endB - endA || b.m[0].length - a.m[0].length
  })
  const best = candidates[0]!
  return { date: best.date, index: best.m.index, length: best.m[0].length, text: best.m[0] }
}
