import { describe, expect, it } from 'vitest'
import { isSessionEmpty } from '../src/pantry.ts'
import type { ProductData } from '../src/types.ts'

describe('isSessionEmpty', () => {
  const session = { addedCount: 0, consumedCount: 0, openedAt: 1000 }
  const product = (at: number) => ({ quantityLog: [{ at: 0, quantity: 6 }, { at, quantity: 5 }] }) as ProductData

  it('is empty when nothing was added, consumed or changed', () => {
    expect(isSessionEmpty(session, [product(500)])).toBe(true)
  })

  it('is not empty after additions, consumptions or quantity changes', () => {
    expect(isSessionEmpty({ ...session, addedCount: 1 }, [])).toBe(false)
    expect(isSessionEmpty({ ...session, consumedCount: 2 }, [])).toBe(false)
    expect(isSessionEmpty(session, [product(1500)])).toBe(false)
  })
})
