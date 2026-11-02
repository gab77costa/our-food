/**
 * Proposals to merge name variants found in the history (abbreviations, typos,
 * singular/plural). Proposals are only suggestions: the user accepts or edits
 * them before the import writes anything.
 */
import { emptyCounts, hintTip } from './categorize.ts'
import { normalizeName } from './text.ts'
import type { Tip } from './tips.ts'

/**
 * Abbreviations seen in the historical files. A trailing "*" takes the final
 * vowel of the first word (agreement): "zucca grigl" -> "zucca grigliata",
 * "finocchi grigl" -> "finocchi grigliati".
 */
export const ABBREVIATIONS: Record<string, string> = {
  grigl: 'grigliat*', rigliato: 'grigliato', gratt: 'grattugiat*', grattug: 'grattugiat*',
  aff: 'affumicat*', spad: 'spadellat*', lessat: 'lessat*',
  ciocc: 'cioccolato', yog: 'yogurt', mozz: 'mozzarella', marmell: 'marmellata',
  minestr: 'minestrone', vell: 'vellutata', brocc: 'broccoli', aspar: 'asparagi',
  pomod: 'pomodoro', veget: 'vegetale', verd: 'verdure', pad: 'padano', int: 'integrali',
  calabr: 'calabrese', tal: 'taleggio', tart: 'tartufo', mand: 'mandorle', veg: 'vegetale',
}

/**
 * Typos seen in the historical files. Automatic typo fixing (edit distance)
 * turned out to be harmful ("finocchi" -> "fiocchi"), so only known ones are
 * fixed here; the rest is left to the --llm option and to the user's review.
 */
export const TYPOS: Record<string, string> = {
  sicilaini: 'siciliani', albococche: 'albicocche', affattato: 'affettato', fileti: 'filetti',
  moito: 'mojito', mandorla0: 'mandorla',
}

export function expandAbbreviations(name: string): string {
  const words = normalizeName(name).split(' ').filter(Boolean).map((w) => TYPOS[w] ?? w)
  const first = words[0] ?? ''
  const vowel = /[aeio]$/.test(first) ? first.slice(-1) : 'o'
  return words
    .map((w, i) => {
      const full = ABBREVIATIONS[w]
      // Adjectives (with "*") only make sense after a noun.
      if (!full || (i === 0 && full.includes('*'))) return w
      return full.replace('*', vowel)
    })
    .join(' ')
}

/** Singular/plural tolerant key: each word without its final vowel. */
export function stemKey(name: string): string {
  return normalizeName(name)
    .split(' ')
    .map((w) => (w.length > 3 ? w.replace(/[aeio]$/, '') : w))
    .join(' ')
}

export interface NameStat {
  /** Normalized original name (without "xN"). */
  name: string
  counts: Record<Tip, number>
}

export interface NameProposal {
  canonical: string
  variants: Array<{ name: string; occurrences: number }>
  counts: Record<Tip, number>
  tip: Tip | null
  reasons: string[]
  occurrences: number
}

export interface ProposalOptions {
  /** Canonical spelling suggested for a single name (e.g. by an LLM). Default: rules. */
  expand?: (name: string) => string
}

const total = (c: Record<Tip, number>) => Object.values(c).reduce((a, b) => a + b, 0)

/** Groups variants of the same product and proposes a canonical, full-length name. */
export function proposeNameGroups(stats: NameStat[], options: ProposalOptions = {}): NameProposal[] {
  const expandRule = options.expand ?? expandAbbreviations

  const expanded = new Map<string, { full: string; reasons: string[] }>()
  for (const s of stats) {
    const reasons: string[] = []
    const full = normalizeName(expandRule(s.name)) || s.name
    if (full !== s.name) {
      const typo = s.name.split(' ').some((w) => TYPOS[w])
      const abbr = s.name.split(' ').some((w) => ABBREVIATIONS[w])
      if (typo) reasons.push('refuso')
      if (abbr || !typo) reasons.push(options.expand ? 'nome per esteso' : 'abbreviazione')
    }
    expanded.set(s.name, { full, reasons })
  }

  // Union-find over: same expanded name, same singular/plural stem.
  const parent = new Map<string, string>(stats.map((s) => [s.name, s.name]))
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  const union = (a: string, b: string) => parent.set(find(a), find(b))
  const byKey = new Map<string, string>()
  for (const s of stats) {
    for (const key of [`x:${expanded.get(s.name)!.full}`, `s:${stemKey(expanded.get(s.name)!.full)}`]) {
      const other = byKey.get(key)
      if (other) union(s.name, other)
      else byKey.set(key, s.name)
    }
  }

  const groups = new Map<string, NameStat[]>()
  for (const s of stats) {
    const root = find(s.name)
    groups.set(root, [...(groups.get(root) ?? []), s])
  }

  const proposals: NameProposal[] = []
  for (const members of groups.values()) {
    const counts = emptyCounts()
    for (const m of members) for (const t of Object.keys(counts) as Tip[]) counts[t] += m.counts[t] ?? 0
    // Canonical: the expanded form of the most frequent member; ties -> longest.
    const ranked = [...members].sort(
      (a, b) => total(b.counts) - total(a.counts) || expanded.get(b.name)!.full.length - expanded.get(a.name)!.full.length,
    )
    const canonical = expanded.get(ranked[0]!.name)!.full
    const reasons = new Set<string>()
    for (const m of members) expanded.get(m.name)!.reasons.forEach((r) => reasons.add(r))
    if (new Set(members.map((m) => expanded.get(m.name)!.full)).size > 1) reasons.add('singolare/plurale')
    proposals.push({
      canonical,
      variants: ranked.map((m) => ({ name: m.name, occurrences: total(m.counts) })),
      counts,
      tip: hintTip({ override: null, counts }),
      reasons: [...reasons],
      occurrences: total(counts),
    })
  }

  // Changes first (they need review), then by frequency.
  return proposals.sort(
    (a, b) =>
      Number(isUnchanged(a)) - Number(isUnchanged(b)) || b.occurrences - a.occurrences || a.canonical.localeCompare(b.canonical),
  )
}

export function isUnchanged(p: NameProposal): boolean {
  return p.variants.length === 1 && p.variants[0]!.name === p.canonical
}
