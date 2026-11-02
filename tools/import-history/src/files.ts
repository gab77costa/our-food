import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { FULL_SHEET, type Snapshot } from '@ourfoodhub/core'
import { readWorkbook, sheetDifferences } from '@ourfoodhub/core/excel'

export interface LoadedSnapshot extends Snapshot {
  file: string
  warnings: string[]
}

const FILE_RE = /^scad_(\d{4}-\d{2}-\d{2}).*_FINAL\.xlsx$/i

/** Reads every scad_YYYY-MM-DD*_FINAL.xlsx in `dir` (other files are ignored), oldest first. FULL is the source of truth. */
export async function loadSnapshots(dir: string): Promise<LoadedSnapshot[]> {
  const all = readdirSync(dir)
  const files = all.filter((f) => FILE_RE.test(f)).sort()
  if (!files.length) throw new Error(`Nessun file scad_AAAA-MM-GG*_FINAL.xlsx in ${dir}`)
  const skipped = all.filter((f) => /\.xlsx$/i.test(f) && !FILE_RE.test(f))
  if (skipped.length) console.warn(`Ignorati ${skipped.length} file .xlsx che non finiscono con _FINAL.xlsx: ${skipped.join(', ')}`)
  const dates = files.map((f) => FILE_RE.exec(f)![1]!)
  const dup = dates.find((d, i) => dates.indexOf(d) !== i)
  if (dup) throw new Error(`Più file _FINAL per il ${dup}: ne serve uno solo per giorno`)

  const out: LoadedSnapshot[] = []
  for (const f of files) {
    const date = FILE_RE.exec(f)![1]!
    let sheets: Awaited<ReturnType<typeof readWorkbook>>
    try {
      sheets = await readWorkbook(readFileSync(join(dir, f)))
    } catch (e) {
      throw new Error(`${f}: ${(e as Error).message}`)
    }
    const full = sheets.find((s) => s.name === FULL_SHEET)
    if (!full) throw new Error(`${f}: foglio FULL mancante`)
    const diff = sheetDifferences(sheets)
    const warnings = [
      ...sheets.flatMap((s) => s.filledTips),
      ...diff.onlyInSheets.map((d) => `solo nei fogli (ignorato) → ${d}`),
      ...diff.onlyInFull.map((d) => `solo in FULL (importato) → ${d}`),
    ]
    out.push({ date, file: basename(f), rows: full.rows, warnings })
  }
  return out
}
