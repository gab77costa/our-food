import { describe, expect, it } from 'vitest'
import { abbreviationMatch, buildHintIndex, emptyCounts, hintTip, keywordTip, suggestTip } from '../src/categorize.ts'
import type { CategoryHint } from '../src/types.ts'

const hint = (displayName: string, counts: Partial<CategoryHint['counts']>, aliases: string[] = [], override: CategoryHint['override'] = null): CategoryHint => ({
  id: displayName,
  displayName,
  aliases,
  counts: { ...emptyCounts(), ...counts },
  override,
  lastSeen: 0,
  source: 'import',
})

describe('categorize', () => {
  const index = buildHintIndex([
    hint('zucca grigliata', { f: 3 }, ['zucca grigl']),
    hint('latte avena', { b: 10, f: 1 }),
    hint('mix ceci orzo farro', { f: 1, d: 1 }, [], 'd'),
  ])

  it('prefers the manual override, then the most frequent tip', () => {
    expect(hintTip(hint('x', { f: 5, d: 2 }))).toBe('f')
    expect(hintTip(hint('x', { f: 5 }, [], 'c'))).toBe('c')
  })

  it('finds exact names and aliases', () => {
    expect(suggestTip('Latte avena', index)).toMatchObject({ tip: 'b', source: 'history' })
    expect(suggestTip('zucca grigl', index)).toMatchObject({ tip: 'f', source: 'history', canonicalName: 'zucca grigliata' })
    expect(suggestTip('mix ceci orzo farro', index)?.tip).toBe('d')
  })

  it('finds similar names', () => {
    expect(suggestTip('latte di avena', index)).toMatchObject({ tip: 'b', source: 'similar' })
    expect(abbreviationMatch('finocchi grigl', 'finocchi grigliati')).toBe(true)
    expect(abbreviationMatch('broccoli', 'broccoli lessati')).toBe(false)
  })

  it('falls back to keywords', () => {
    expect(keywordTip('piselli surgelati')).toBe('c')
    expect(keywordTip('broccoli lessati')).toBe('f')
    expect(keywordTip('mele golden')).toBe('v')
    expect(suggestTip('qualcosa di strano', index)).toBeNull()
  })
})
