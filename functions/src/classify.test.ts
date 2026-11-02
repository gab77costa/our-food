import { describe, expect, it } from 'vitest'
import { buildPrompt } from './classify.js'

describe('buildPrompt', () => {
  it('includes the family examples and every name', () => {
    const p = buildPrompt(['zucca grigliata', 'gelato pistacchio'], [{ name: 'latte avena', tip: 'b' }])
    expect(p).toContain('- latte avena → b')
    expect(p).toContain('- zucca grigliata')
    expect(p).toContain('- gelato pistacchio')
  })
})
