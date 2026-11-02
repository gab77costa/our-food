import { describe, expect, it } from 'vitest'
import { emptyCounts } from '../src/categorize.ts'
import { expandAbbreviations, proposeNameGroups, type NameStat } from '../src/names.ts'

const stat = (name: string, counts: Partial<NameStat['counts']>): NameStat => ({ name, counts: { ...emptyCounts(), ...counts } })

describe('names', () => {
  it('expands abbreviations with gender agreement', () => {
    expect(expandAbbreviations('zucca grigl')).toBe('zucca grigliata')
    expect(expandAbbreviations('finocchi grigl')).toBe('finocchi grigliati')
    expect(expandAbbreviations('budino soia ciocc')).toBe('budino soia cioccolato')
    expect(expandAbbreviations('pecorino gratt')).toBe('pecorino grattugiato')
    expect(expandAbbreviations('mozz bufala')).toBe('mozzarella bufala')
    expect(expandAbbreviations('anelli sicilaini freddi')).toBe('anelli siciliani freddi')
  })

  it('never rewrites correct words into other words', () => {
    const proposals = proposeNameGroups([
      stat('finocchi grigl', { f: 1 }),
      stat('fiocchi latte', { f: 3 }),
      stat('pomodori', { v: 1 }),
      stat('pomodoro', { v: 1 }),
      stat('zucca grigl', { f: 1 }),
      stat('zucchine grigliate', { f: 1 }),
    ])
    const canon = (n: string) => proposals.find((p) => p.variants.some((v) => v.name === n))!.canonical
    expect(canon('finocchi grigl')).toBe('finocchi grigliati')
    expect(canon('zucca grigl')).toBe('zucca grigliata')
    expect(canon('zucchine grigliate')).toBe('zucchine grigliate')
    expect(canon('pomodori')).toBe(canon('pomodoro')) // singular/plural grouped, word kept
  })

  it('groups variants and keeps different products apart', () => {
    const proposals = proposeNameGroups([
      stat('mozzarella', { f: 5 }),
      stat('mozzarelle', { f: 2 }),
      stat('mozz bufala', { f: 1 }),
      stat('pecorino gratt', { f: 1 }),
      stat('pecorino grattug', { f: 1 }),
      stat('pecorino', { f: 3 }),
      stat('broccoli lessati', { f: 1 }),
      stat('broccoletti', { f: 2 }),
      stat('pesche gialle', { v: 1 }),
      stat('pesce spada', { f: 1 }),
    ])
    const find = (n: string) => proposals.find((p) => p.variants.some((v) => v.name === n))!
    expect(find('mozzarelle').canonical).toBe('mozzarella')
    expect(find('mozzarelle').variants.map((v) => v.name).sort()).toEqual(['mozzarella', 'mozzarelle'])
    expect(find('mozz bufala').canonical).toBe('mozzarella bufala')
    expect(find('pecorino gratt')).toBe(find('pecorino grattug'))
    expect(find('pecorino gratt').canonical).toBe('pecorino grattugiato')
    expect(find('pecorino')).not.toBe(find('pecorino gratt'))
    expect(find('broccoli lessati')).not.toBe(find('broccoletti'))
    expect(find('pesche gialle')).not.toBe(find('pesce spada'))
    // Proposals with changes come first
    expect(proposals.at(-1)!.reasons).toEqual([])
  })
})
