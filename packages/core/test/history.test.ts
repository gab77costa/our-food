import { describe, expect, it } from 'vitest'
import { reconstructHistory } from '../src/history.ts'
import { sessionRows } from '../src/pantry.ts'
import type { SheetRow } from '../src/types.ts'

const row = (tip: SheetRow['tip'], desc: string, date: string | null = null): SheetRow => ({ tip, desc, date })

describe('reconstructHistory', () => {
  const snaps = [
    { date: '2026-01-10', rows: [row('f', 'kefir x6', '2026-01-20'), row('v', 'banane'), row('d', 'tonno x8', '2050-12-31')] },
    { date: '2026-01-17', rows: [row('v', 'banane'), row('f', 'kefir x4', '2026-01-20'), row('f', 'uova x6', '2026-01-30')] },
    { date: '2026-01-24', rows: [row('v', 'banane'), row('f', 'uova x6', '2026-01-30'), row('f', 'kefir x6', '2026-02-05')] },
  ]
  const r = reconstructHistory(snaps)

  it('creates one closed session per file', () => {
    expect(r.sessions.map((s) => s.id)).toEqual(['2026-01-10', '2026-01-17', '2026-01-24'])
    expect(r.sessions.every((s) => s.status === 'closed' && s.source === 'import')).toBe(true)
  })

  it('tracks products across files', () => {
    // banane is always the same product (no date, generic name)
    expect(r.products.filter((p) => p.name === 'banane')).toHaveLength(1)
    // kefir with a new expiry date is a new product; the old one was consumed
    const kefir = r.products.filter((p) => p.name === 'kefir')
    expect(kefir).toHaveLength(2)
    expect(kefir[0]).toMatchObject({ status: 'consumed', consumedInSessionId: '2026-01-24', quantity: 4 })
    expect(kefir[1]).toMatchObject({ status: 'active', quantity: 6 })
    // tonno disappeared in the second file
    expect(r.products.find((p) => p.name === 'tonno')).toMatchObject({ status: 'consumed', consumedInSessionId: '2026-01-17' })
    expect(r.stats).toMatchObject({ snapshots: 3, products: 5, active: 3, consumed: 2, quantityChanges: 1 })
  })

  it('rebuilds every file exactly, including order and quantities', () => {
    for (const [i, s] of r.sessions.entries()) {
      expect(sessionRows(r.products, s)).toEqual(snaps[i]!.rows)
    }
  })

  it('applies canonical names', () => {
    const c = reconstructHistory([{ date: '2026-01-10', rows: [row('f', 'zucca grigl', '2026-01-20')] }], {
      canonical: (n) => (n === 'zucca grigl' ? 'zucca grigliata' : n),
    })
    expect(c.products[0]!.name).toBe('zucca grigliata')
  })

  it('rejects two files on the same day', () => {
    expect(() => reconstructHistory([snaps[0]!, { ...snaps[1]!, date: '2026-01-10' }])).toThrow()
  })
})
