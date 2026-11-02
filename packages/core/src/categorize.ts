import { normalizeName } from './text.ts'
import { TIPS, type Tip } from './tips.ts'
import type { CategoryHint } from './types.ts'

export type SuggestionSource = 'history' | 'similar' | 'keyword'

export interface TipSuggestion {
  tip: Tip
  source: SuggestionSource
  /** The known name that produced the suggestion. */
  matched?: string
  /** Canonical display name, when the input is a known alias. */
  canonicalName?: string
  score: number
}

/** The tip a hint stands for: manual override first, then the most frequent. */
export function hintTip(hint: Pick<CategoryHint, 'override' | 'counts'>): Tip | null {
  if (hint.override) return hint.override
  let best: Tip | null = null
  let bestCount = 0
  for (const t of TIPS) {
    const c = hint.counts[t] ?? 0
    if (c > bestCount) {
      best = t
      bestCount = c
    }
  }
  return best
}

export function emptyCounts(): Record<Tip, number> {
  return { v: 0, f: 0, c: 0, d: 0, b: 0 }
}

// ── Trigram similarity ───────────────────────────────────────────────────────

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `
  const out = new Set<string>()
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3))
  return out
}

/** Dice coefficient on character trigrams, 0..1 (like pg_trgm, which the old app used). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1
  const ta = trigrams(a)
  const tb = trigrams(b)
  let common = 0
  for (const t of ta) if (tb.has(t)) common++
  return (2 * common) / (ta.size + tb.size)
}

/**
 * Word-by-word prefix match: "zucca grigl" matches "zucca grigliata".
 * Lets abbreviations typed in the old files meet the full words dictated now.
 */
export function abbreviationMatch(a: string, b: string): boolean {
  const wa = a.split(' ')
  const wb = b.split(' ')
  if (wa.length !== wb.length || a === b) return false
  return wa.every((x, i) => {
    const y = wb[i]!
    if (x === y) return true
    const [short, long] = x.length <= y.length ? [x, y] : [y, x]
    return short.length >= 3 && long.startsWith(short)
  })
}

// ── Keywords (last resort before asking the LLM) ─────────────────────────────

const KEYWORDS: Array<[Tip, string[]]> = [
  ['c', ['surgelat', 'gelato', 'gelati', 'ghiaccioli', 'bastoncini', 'sofficini', 'nuggets', 'filetti merluzzo', 'congelat']],
  ['b', ['succo', 'succhi', 'acqua', 'birra', 'vino', 'spumante', 'prosecco', 'bibita', 'aranciata', 'coca cola', 'tisana', 'latte avena', 'latte soia', 'latte mandorla', 'latte riso', 'latte nocciola', 'bevanda']],
  ['f', ['latte fresco', 'yogurt', 'yog ', 'kefir', 'formaggio', 'mozzarella', 'mozzarelle', 'ricotta', 'burro', 'panna', 'stracchino', 'scamorza', 'grana', 'parmigiano', 'pecorino', 'prosciutto', 'bresaola', 'salame', 'speck', 'pancetta', 'mortadella', 'affettat', 'wurstel', 'uova', 'budino', 'budini', 'tiramisu', 'insalata', 'misticanza', 'lessat', 'grigliat', 'zuppa', 'vellutata', 'passato', 'hummus', 'falafel', 'tortelli', 'ravioli', 'gnocchi', 'pasta fresca', 'pasta fredda', 'carne', 'pollo', 'tacchino', 'manzo', 'salmone', 'pesce']],
  ['v', ['mele', 'mela', 'pere', 'pera', 'banane', 'banana', 'arance', 'arancia', 'clementine', 'mandarini', 'limoni', 'uva', 'pesche', 'albicocche', 'ciliegie', 'fragole', 'mirtilli', 'kiwi', 'anguria', 'melone', 'pomodori', 'datterini', 'zucchine', 'melanzane', 'peperoni', 'carote', 'patate', 'cipolle', 'aglio', 'zenzero', 'finocchi', 'radicchio', 'lattuga', 'cavolfiore', 'broccoli', 'spinaci', 'sedano', 'zucca']],
  ['d', ['pasta', 'riso', 'biscotti', 'cracker', 'grissini', 'fette biscottate', 'farina', 'zucchero', 'caffe', 'caffè', 'tonno', 'fagioli', 'ceci', 'lenticchie', 'cannellini', 'legumi', 'passata', 'polpa', 'pelati', 'olio', 'aceto', 'marmellata', 'miele', 'cereali', 'muesli', 'scatola', 'brodo', 'polenta', 'piadine', 'pane']],
]

const NORMALIZED_KEYWORDS = KEYWORDS.map(([tip, words]) => [tip, words.map(normalizeName)] as const)

/** Keywords match the start of a word: "lessat" matches "broccoli lessati". */
export function keywordTip(name: string): Tip | null {
  const n = ` ${normalizeName(name)}`
  for (const [tip, words] of NORMALIZED_KEYWORDS) {
    if (words.some((w) => n.includes(` ${w}`))) return tip
  }
  return null
}

// ── Index over the learned names ─────────────────────────────────────────────

export interface HintIndex {
  byKey: Map<string, CategoryHint>
  entries: Array<{ key: string; hint: CategoryHint }>
}

export function buildHintIndex(hints: CategoryHint[]): HintIndex {
  const byKey = new Map<string, CategoryHint>()
  const entries: HintIndex['entries'] = []
  for (const h of hints) {
    const keys = new Set([normalizeName(h.displayName), ...h.aliases.map(normalizeName)])
    for (const k of keys) {
      if (!k) continue
      if (!byKey.has(k)) byKey.set(k, h)
      entries.push({ key: k, hint: h })
    }
  }
  return { byKey, entries }
}

export const SIMILARITY_THRESHOLD = 0.6

/** Suggests the tip for a name using only local data: history, similar names, keywords. */
export function suggestTip(name: string, index: HintIndex): TipSuggestion | null {
  const key = normalizeName(name)
  if (!key) return null

  const exact = index.byKey.get(key)
  const exactTip = exact && hintTip(exact)
  if (exact && exactTip) {
    return { tip: exactTip, source: 'history', matched: exact.displayName, canonicalName: exact.displayName, score: 1 }
  }

  let best: { hint: CategoryHint; score: number; key: string } | null = null
  for (const e of index.entries) {
    const score = abbreviationMatch(key, e.key) ? 0.95 : similarity(key, e.key)
    if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) best = { hint: e.hint, score, key: e.key }
  }
  const bestTip = best && hintTip(best.hint)
  if (best && bestTip) return { tip: bestTip, source: 'similar', matched: best.hint.displayName, score: best.score }

  const kw = keywordTip(name)
  if (kw) return { tip: kw, source: 'keyword', score: 0.5 }
  return null
}
