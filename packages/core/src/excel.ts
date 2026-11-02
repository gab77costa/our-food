/**
 * Workbook in the same format as the historical files:
 * sheets "Frutta e verdura", "Congelatore", "Frigorifero", "Dispensa e bevande", "FULL",
 * columns tip / desc / date, rows in insertion order.
 */
import ExcelJS from 'exceljs'
import { excelSerialToIso, isValidIsoDate, toIsoDate } from './dates.ts'
import { FULL_SHEET, isTip, SHEETS, type Tip } from './tips.ts'
import type { ExportRow, IsoDate, SheetRow } from './types.ts'

export const HEADER = ['tip', 'desc', 'date'] as const
/** Same number format as the historical files. */
export const DATE_FORMAT = 'yyyy-mm-dd hh:mm:ss'

export function workbookFileName(sessionDate: IsoDate): string {
  return `scad_${sessionDate}_FINAL.xlsx`
}

function addSheet(wb: ExcelJS.Workbook, name: string, rows: ExportRow[]) {
  const ws = wb.addWorksheet(name)
  ws.columns = [{ width: 6 }, { width: 34 }, { width: 20 }]
  const header = ws.addRow([...HEADER])
  header.eachCell((cell) => {
    cell.font = { bold: true }
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
  })
  for (const r of rows) {
    const row = ws.addRow([r.tip ?? '', r.desc, r.date ? isoToUtcDate(r.date) : null])
    if (r.date) row.getCell(3).numFmt = DATE_FORMAT
  }
}

function isoToUtcDate(iso: IsoDate): Date {
  return new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)))
}

export function buildWorkbook(rows: ExportRow[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'OurFoodHub'
  for (const sheet of SHEETS) {
    addSheet(wb, sheet.name, rows.filter((r) => r.tip !== null && sheet.tips.includes(r.tip)))
  }
  addSheet(wb, FULL_SHEET, rows)
  return wb
}

export async function buildWorkbookBuffer(rows: ExportRow[]): Promise<ArrayBuffer> {
  const buf = await buildWorkbook(rows).xlsx.writeBuffer()
  return buf as ArrayBuffer
}

// ── Reading (history import and tests) ───────────────────────────────────────

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((t) => t.text).join('')
  if (typeof v === 'object' && 'text' in v) return String(v.text)
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '')
  return String(v)
}

export function cellDate(v: ExcelJS.CellValue): IsoDate | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) return toIsoDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate())
  if (typeof v === 'number') return excelSerialToIso(v)
  const s = cellText(v).trim()
  if (!s) return null
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToIso(parseFloat(s))
  const iso = s.slice(0, 10)
  if (isValidIsoDate(iso)) return iso
  throw new Error(`Data non riconosciuta: "${s}"`)
}

export interface ReadSheet {
  name: string
  rows: SheetRow[]
  /** Rows whose empty tip was filled in from the sheet or from the other sheets. */
  filledTips: string[]
}

interface RawRow {
  rowNumber: number
  tip: string
  desc: string
  date: IsoDate | null
}

/**
 * Reads every sheet of a workbook as tip/desc/date rows (header row skipped).
 * An empty tip is filled in when it is certain: from the sheet when it holds a
 * single tip (e.g. Congelatore = c), otherwise from the same desc and date in
 * another sheet.
 */
export async function readWorkbook(data: ArrayBuffer | Uint8Array): Promise<ReadSheet[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(data as ArrayBuffer)
  const raw: Array<{ name: string; rows: RawRow[] }> = []
  wb.eachSheet((ws) => {
    const rows: RawRow[] = []
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const desc = cellText(row.getCell(2).value).trim()
      // Rows without a description carry no product (seen in some old files).
      if (!desc) return
      const tip = cellText(row.getCell(1).value).trim().toLowerCase()
      let date: IsoDate | null
      try {
        date = cellDate(row.getCell(3).value)
      } catch (e) {
        throw new Error(`Foglio "${ws.name}", riga ${rowNumber} ("${desc}"): ${(e as Error).message}`)
      }
      rows.push({ rowNumber, tip, desc, date })
    })
    raw.push({ name: ws.name, rows })
  })

  const sheetTip = (name: string) => {
    const tips = SHEETS.find((s) => s.name === name)?.tips
    return tips?.length === 1 ? tips[0]! : null
  }
  // Tips known from rows that have one (or from single-tip sheets), by desc+date.
  const known = new Map<string, Set<Tip>>()
  const key = (r: RawRow) => `${r.desc.toLowerCase()}|${r.date ?? ''}`
  for (const sheet of raw) {
    for (const r of sheet.rows) {
      const tip = isTip(r.tip) ? r.tip : r.tip === '' ? sheetTip(sheet.name) : null
      if (tip) known.set(key(r), (known.get(key(r)) ?? new Set()).add(tip))
    }
  }

  return raw.map((sheet) => {
    const filledTips: string[] = []
    const rows = sheet.rows.map((r): SheetRow => {
      const where = `Foglio "${sheet.name}", riga ${r.rowNumber} ("${r.desc}")`
      if (isTip(r.tip)) return { tip: r.tip, desc: r.desc, date: r.date }
      if (r.tip !== '') throw new Error(`${where}: tip sconosciuto "${r.tip}"`)
      const candidates = known.get(key(r))
      const tip = sheetTip(sheet.name) ?? (candidates?.size === 1 ? [...candidates][0]! : null)
      if (!tip) throw new Error(`${where}: tip vuoto e non ricavabile, compilalo nel file`)
      filledTips.push(`${where}: tip vuoto → "${tip}"`)
      return { tip, desc: r.desc, date: r.date }
    })
    return { name: sheet.name, rows, filledTips }
  })
}

const rowKey = (r: SheetRow) => `${r.tip}|${r.desc}|${r.date ?? ''}`

/**
 * Differences between the FULL sheet and the per-place sheets. FULL is what the
 * import uses; differences (rows fixed in one sheet only, empty rows) are warnings.
 */
export function sheetDifferences(sheets: Array<Pick<ReadSheet, 'name' | 'rows'>>): { onlyInSheets: string[]; onlyInFull: string[] } {
  const full = sheets.find((s) => s.name === FULL_SHEET)
  if (!full) throw new Error('Foglio FULL mancante')
  const fullKeys = full.rows.map(rowKey)
  const otherKeys = sheets.filter((s) => s !== full).flatMap((s) => s.rows.map((r) => ({ sheet: s.name, key: rowKey(r) })))
  const remaining = [...fullKeys]
  const onlyInSheets: string[] = []
  for (const o of otherKeys) {
    const i = remaining.indexOf(o.key)
    if (i >= 0) remaining.splice(i, 1)
    else onlyInSheets.push(`${o.sheet}: ${o.key}`)
  }
  return { onlyInSheets, onlyInFull: remaining }
}
