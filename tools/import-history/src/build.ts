import {
  emptyCounts,
  formatDesc,
  hintTip,
  normalizeName,
  reconstructHistory,
  sessionRows,
  splitQuantity,
  type CategoryHint,
  type NameStat,
  type Reconstruction,
  type ExportRow,
  type Snapshot,
  type Tip,
} from '@ourfoodhub/core'

/** Distinct names (normalized, without "xN") with how many rows used each tip. */
export function collectNameStats(snapshots: Snapshot[]): NameStat[] {
  const map = new Map<string, NameStat>()
  for (const s of snapshots) {
    for (const r of s.rows) {
      const name = normalizeName(splitQuantity(r.desc).name)
      if (!name) continue
      const st = map.get(name) ?? { name, counts: emptyCounts() }
      st.counts[r.tip]++
      map.set(name, st)
    }
  }
  return [...map.values()]
}

/** One row of the proposals file, after the user's review. */
export interface NameDecision {
  variants: string[]
  accept: boolean
  finalName: string
  proposedTip: Tip | null
  finalTip: Tip | null
}

export interface CanonicalPlan {
  canonicalOf: Map<string, string>
  /** Manual tip choices (only where they differ from the history). */
  overrides: Map<string, Tip>
}

export function planFromDecisions(decisions: NameDecision[]): CanonicalPlan {
  const canonicalOf = new Map<string, string>()
  const overrides = new Map<string, Tip>()
  for (const d of decisions) {
    if (d.accept) {
      const canonical = normalizeName(d.finalName) || d.variants[0]!
      for (const v of d.variants) canonicalOf.set(v, canonical)
      if (d.finalTip && d.finalTip !== d.proposedTip) overrides.set(canonical, d.finalTip)
    } else {
      // Rejected: every variant stays as it was, no merge and no expansion.
      for (const v of d.variants) canonicalOf.set(v, v)
    }
  }
  return { canonicalOf, overrides }
}

/** Learned names for categorization, one per canonical name, with all its spellings. */
export function buildHints(stats: NameStat[], plan: CanonicalPlan, lastSeenByName: Map<string, number>): CategoryHint[] {
  const hints = new Map<string, CategoryHint>()
  for (const s of stats) {
    const canonical = plan.canonicalOf.get(s.name) ?? s.name
    const key = normalizeName(canonical)
    const h = hints.get(key) ?? {
      id: key,
      displayName: canonical,
      aliases: [],
      counts: emptyCounts(),
      override: plan.overrides.get(canonical) ?? null,
      lastSeen: lastSeenByName.get(canonical) ?? 0,
      source: 'import' as const,
    }
    for (const t of Object.keys(h.counts) as Tip[]) h.counts[t] += s.counts[t]
    if (s.name !== key && !h.aliases.includes(s.name)) h.aliases.push(s.name)
    hints.set(key, h)
  }
  // Drop overrides that agree with the counts anyway.
  for (const h of hints.values()) {
    if (h.override && h.override === hintTip({ override: null, counts: h.counts })) h.override = null
  }
  return [...hints.values()]
}

export interface Verification {
  sessionsChecked: number
  mismatches: Array<{ session: string; expected: ExportRow[]; actual: ExportRow[] }>
}

/** Rebuilds every session's file from the reconstructed data and compares it with the original. */
export function verify(snapshots: Snapshot[], rec: Reconstruction, plan: CanonicalPlan): Verification {
  const mismatches: Verification['mismatches'] = []
  for (const snap of snapshots) {
    const session = rec.sessions.find((s) => s.id === snap.date)!
    const expected = snap.rows.map((r) => {
      const { name, quantity } = splitQuantity(r.desc)
      const n = normalizeName(name)
      return { ...r, desc: formatDesc(plan.canonicalOf.get(n) ?? n, quantity) }
    })
    const actual = sessionRows(rec.products, session)
    if (JSON.stringify(expected) !== JSON.stringify(actual)) mismatches.push({ session: snap.date, expected, actual })
  }
  return { sessionsChecked: snapshots.length, mismatches }
}

export interface ImportPlan {
  reconstruction: Reconstruction
  hints: CategoryHint[]
  verification: Verification
}

export function buildImport(snapshots: Snapshot[], decisions: NameDecision[]): ImportPlan {
  const plan = planFromDecisions(decisions)
  const reconstruction = reconstructHistory(snapshots, {
    canonical: (n) => plan.canonicalOf.get(n) ?? n,
  })
  const lastSeen = new Map<string, number>()
  const lastClose = reconstruction.sessions.at(-1)?.closedAt ?? 0
  for (const p of reconstruction.products) {
    const t = p.consumedAt ?? lastClose
    if (t > (lastSeen.get(p.name) ?? 0)) lastSeen.set(p.name, t)
  }
  const hints = buildHints(collectNameStats(snapshots), plan, lastSeen)
  return { reconstruction, hints, verification: verify(snapshots, reconstruction, plan) }
}
