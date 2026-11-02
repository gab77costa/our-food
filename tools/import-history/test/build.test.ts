import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { proposeNameGroups, type Snapshot } from '@ourfoodhub/core'
import { describe, expect, it } from 'vitest'
import { buildImport, collectNameStats, type NameDecision } from '../src/build.ts'
import { loadSnapshots } from '../src/files.ts'

/** Accepts every proposal as is, like a user who reviewed and changed nothing. */
function acceptAll(snapshots: Snapshot[]): NameDecision[] {
  return proposeNameGroups(collectNameStats(snapshots)).map((p) => ({
    variants: p.variants.map((v) => v.name),
    accept: true,
    finalName: p.canonical,
    proposedTip: p.tip,
    finalTip: p.tip,
  }))
}

describe('buildImport', () => {
  const snapshots: Snapshot[] = [
    { date: '2026-01-10', rows: [{ tip: 'f', desc: 'zucca grigl', date: '2026-01-20' }, { tip: 'v', desc: 'banane', date: null }] },
    { date: '2026-01-17', rows: [{ tip: 'v', desc: 'banane', date: null }, { tip: 'f', desc: 'zucca grigliata', date: '2026-01-25' }] },
  ]

  it('merges variants, learns aliases and verifies every file', () => {
    const plan = buildImport(snapshots, acceptAll(snapshots))
    expect(plan.verification.mismatches).toEqual([])
    const zucca = plan.hints.find((h) => h.displayName === 'zucca grigliata')!
    expect(zucca.aliases).toEqual(['zucca grigl'])
    expect(zucca.counts.f).toBe(2)
    expect(plan.reconstruction.products.map((p) => p.name).sort()).toEqual(['banane', 'zucca grigliata', 'zucca grigliata'])
  })

  it('keeps names as they are when a proposal is rejected', () => {
    const decisions = acceptAll(snapshots).map((d) => ({ ...d, accept: false }))
    const plan = buildImport(snapshots, decisions)
    expect(plan.reconstruction.products.map((p) => p.name)).toContain('zucca grigl')
    expect(plan.verification.mismatches).toEqual([])
  })

  it('records a manual tip as override', () => {
    const decisions = acceptAll(snapshots).map((d) => (d.variants.includes('banane') ? { ...d, finalTip: 'd' as const } : d))
    const plan = buildImport(snapshots, decisions)
    expect(plan.hints.find((h) => h.displayName === 'banane')!.override).toBe('d')
  })

  const SAMPLES = join(import.meta.dirname, '../../../docs/samples')
  it.skipIf(!existsSync(SAMPLES))('rebuilds the local sample files exactly', async () => {
    const loaded = await loadSnapshots(SAMPLES)
    const plan = buildImport(loaded, acceptAll(loaded))
    expect(plan.verification.mismatches).toEqual([])
    expect(plan.reconstruction.sessions.at(-1)!.id).toBe(loaded.at(-1)!.date)
  })
})
