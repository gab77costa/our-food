import { describe, expect, it } from 'vitest'
import { parseUtterance } from '../src/voice.ts'

const TODAY = '2026-10-27'
const p = (s: string) => {
  const r = parseUtterance(s, TODAY)
  return { name: r.name, quantity: r.quantity, expiryDate: r.expiryDate }
}

describe('parseUtterance', () => {
  it.each([
    ['yogurt greco Fage 3 ottobre 2026', { name: 'yogurt greco fage', quantity: 1, expiryDate: '2026-10-03' }],
    ['sei kefir scade il 19 novembre', { name: 'kefir', quantity: 6, expiryDate: '2026-11-19' }],
    ['kefir sei pezzi 19 novembre 2026', { name: 'kefir', quantity: 6, expiryDate: '2026-11-19' }],
    ['kefir x6 19 novembre 2026', { name: 'kefir', quantity: 6, expiryDate: '2026-11-19' }],
    ['budino soia cioccolato 4 vasetti aprile 2027', { name: 'budino soia cioccolato', quantity: 4, expiryDate: '2027-04-30' }],
    ['pere abate quattro', { name: 'pere abate', quantity: 4, expiryDate: null }],
    ['banane', { name: 'banane', quantity: 1, expiryDate: null }],
    ['biscotti 3 marie 31 ottobre 2027', { name: 'biscotti 3 marie', quantity: 1, expiryDate: '2027-10-31' }],
    ['aggiungi una mozzarella di bufala 5 novembre', { name: 'mozzarella di bufala', quantity: 1, expiryDate: '2026-11-05' }],
    ['2 mozzarelle 5 novembre', { name: 'mozzarelle', quantity: 2, expiryDate: '2026-11-05' }],
    ['sei uova 10 novembre', { name: 'uova', quantity: 6, expiryDate: '2026-11-10' }],
    ['tonno otto scatolette 2050', { name: 'tonno', quantity: 8, expiryDate: '2050-12-31' }],
    ['Latte fresco scade 28 ottobre.', { name: 'latte fresco', quantity: 1, expiryDate: '2026-10-28' }],
  ])('%s', (text, expected) => {
    expect(p(text)).toEqual(expected)
  })

  it('marks dates that do not exist', () => {
    const r = parseUtterance('latte 31 settembre', TODAY)
    expect(r.invalidDate).toBe(true)
    expect(r.name).toBe('latte')
  })
})
