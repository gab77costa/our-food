import { describe, expect, it } from 'vitest'
import { daysUntil, excelSerialToIso, expiryStatus, findSpokenDate, localToday } from '../src/dates.ts'

const TODAY = '2026-10-27'
const date = (s: string) => findSpokenDate(s, TODAY)?.date

describe('findSpokenDate', () => {
  it.each([
    ['yogurt greco 3 ottobre 2026', '2026-10-03'],
    ['kefir scade il 19 novembre 2026', '2026-11-19'],
    ['latte 28 settembre', '2026-09-28'], // no year -> current year (even if already past)
    ['pasta primo dicembre 2027', '2027-12-01'],
    ['pasta 1º dicembre 2027', '2027-12-01'],
    ['budino tre novembre', '2026-11-03'],
    ['biscotti maggio 2027', '2027-05-31'], // month + year -> last day of month
    ['biscotti febbraio 2028', '2028-02-29'],
    ['biscotti ottobre del 2027', '2027-10-31'],
    ['tonno 2050', '2050-12-31'], // year alone -> 31 December
    ['passata 3/10/2026', '2026-10-03'],
    ['passata 3-10-26', '2026-10-03'],
    ['passata 3/10', '2026-10-03'],
    ['mozzarella 5 novembre 26', '2026-11-05'],
  ])('%s -> %s', (text, expected) => {
    expect(date(text)).toBe(expected)
  })

  it('flags dates that do not exist', () => {
    const m = findSpokenDate('latte 31 settembre 2026', TODAY)
    expect(m).not.toBeNull()
    expect(m!.date).toBeNull()
  })

  it('does not take numbers inside the name as a date', () => {
    expect(findSpokenDate('biscotti 3 marie', TODAY)).toBeNull()
    expect(date('biscotti 3 marie 31 ottobre 2027')).toBe('2027-10-31')
  })

  it('returns the span to remove from the name', () => {
    const m = findSpokenDate('kefir scade il 19 novembre', TODAY)!
    expect('kefir scade il 19 novembre'.slice(0, m.index).trim()).toBe('kefir')
  })
})

describe('helpers', () => {
  it('converts Excel serials', () => {
    expect(excelSerialToIso(46345)).toBe('2026-11-19')
    expect(excelSerialToIso(47848)).toBe('2030-12-31')
  })
  it('computes days and status', () => {
    expect(daysUntil('2026-10-28', TODAY)).toBe(1)
    expect(expiryStatus('2026-10-20', TODAY)).toBe('expired')
    expect(expiryStatus('2026-11-01', TODAY)).toBe('soon')
    expect(expiryStatus(null, TODAY)).toBe('none')
  })
  it('uses local time for today', () => {
    expect(localToday(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
  })
})
