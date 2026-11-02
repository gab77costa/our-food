import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildWorkbook, buildWorkbookBuffer, readWorkbook, sheetDifferences, workbookFileName } from '../src/excel.ts'
import { FULL_SHEET, SHEETS } from '../src/tips.ts'
import type { SheetRow } from '../src/types.ts'

const SAMPLES = join(import.meta.dirname, '../../../docs/samples')
const samples = existsSync(SAMPLES) ? readdirSync(SAMPLES).filter((f) => /^scad_.*\.xlsx$/.test(f)) : []

describe('excel', () => {
  const rows: SheetRow[] = [
    { tip: 'v', desc: 'banane', date: null },
    { tip: 'd', desc: 'biscotti 3marie', date: '2027-10-31' },
    { tip: 'b', desc: 'succo pomodoro x6', date: '2028-05-31' },
    { tip: 'f', desc: 'kefir x6', date: '2026-11-19' },
    { tip: 'c', desc: 'filetti merluzzo', date: null },
  ]

  it('writes the historical layout and reads it back', async () => {
    const sheets = await readWorkbook(new Uint8Array(await buildWorkbookBuffer(rows)))
    expect(sheets.map((s) => s.name)).toEqual([...SHEETS.map((s) => s.name), FULL_SHEET])
    expect(sheets.at(-1)!.rows).toEqual(rows)
    expect(sheets.find((s) => s.name === 'Dispensa e bevande')!.rows.map((r) => r.desc)).toEqual(['biscotti 3marie', 'succo pomodoro x6'])
  })

  it('fills an empty tip from the sheet or from the other sheets', async () => {
    const wb = buildWorkbook(rows)
    wb.getWorksheet('Congelatore')!.getCell('A2').value = ''
    wb.getWorksheet('Dispensa e bevande')!.getCell('A3').value = null
    wb.getWorksheet(FULL_SHEET)!.getCell('A5').value = '' // kefir: "f" from Frigorifero
    const sheets = await readWorkbook(new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer))
    expect(sheets.find((s) => s.name === 'Congelatore')!.rows[0]!.tip).toBe('c')
    expect(sheets.find((s) => s.name === 'Dispensa e bevande')!.rows[1]!.tip).toBe('b')
    expect(sheets.at(-1)!.rows).toEqual(rows)
    expect(sheets.flatMap((s) => s.filledTips)).toHaveLength(3)
  })

  it('rejects an empty tip it cannot work out', async () => {
    const wb = buildWorkbook(rows)
    wb.getWorksheet('Dispensa e bevande')!.getCell('A2').value = ''
    wb.getWorksheet(FULL_SHEET)!.getCell('A3').value = ''
    await expect(readWorkbook(new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer))).rejects.toThrow(/riga 2 \("biscotti 3marie"\): tip vuoto/)
  })

  it('names files like the historical ones', () => {
    expect(workbookFileName('2026-10-21')).toBe('scad_2026-10-21_FINAL.xlsx')
  })

  // The samples are personal data and are not committed: these run only locally.
  describe.skipIf(!samples.length)('historical samples', () => {
    it.each(samples)('%s: reads FULL and rebuilds it', async (file) => {
      const sheets = await readWorkbook(readFileSync(join(SAMPLES, file)))
      const full = sheets.find((s) => s.name === FULL_SHEET)!.rows
      expect(full.length).toBeGreaterThan(0)
      // Hand edits can make sheets and FULL differ slightly: reported, never fatal.
      const diff = sheetDifferences(sheets)
      expect(diff.onlyInSheets.length).toBeLessThan(full.length / 4)
      const again = await readWorkbook(new Uint8Array(await buildWorkbookBuffer(full)))
      expect(again.at(-1)!.rows).toEqual(full)
    })
  })

  it('reports differences between sheets and FULL', () => {
    const diff = sheetDifferences([
      { name: 'Congelatore', rows: [{ tip: 'c', desc: 'tris grigliato', date: null }] },
      { name: FULL_SHEET, rows: [{ tip: 'c', desc: 'tris rigliato', date: null }] },
    ])
    expect(diff).toEqual({ onlyInSheets: ['Congelatore: c|tris grigliato|'], onlyInFull: ['c|tris rigliato|'] })
  })
})
