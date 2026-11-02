/**
 * The proposals file: one row per group of name variants. The user reviews it
 * in Excel (accept S/N, final name, final tip) before anything is imported.
 */
import ExcelJS from 'exceljs'
import { isTip, isUnchanged, TIP_LABELS, TIPS, type NameProposal, type Tip } from '@ourfoodhub/core'
import type { NameDecision } from './build.ts'

const COLUMNS = [
  { header: 'gruppo', key: 'group', width: 8 },
  { header: 'varianti', key: 'variants', width: 50 },
  { header: 'occorrenze', key: 'occurrences', width: 11 },
  { header: 'conteggi per tip', key: 'counts', width: 22 },
  { header: 'motivo', key: 'reasons', width: 26 },
  { header: 'nome proposto', key: 'proposedName', width: 34 },
  { header: 'tip proposto', key: 'proposedTip', width: 12 },
  { header: 'accetta (S/N)', key: 'accept', width: 13 },
  { header: 'nome finale', key: 'finalName', width: 34 },
  { header: 'tip finale', key: 'finalTip', width: 10 },
] as const

const VARIANT_SEP = ' | '

export async function writeProposals(path: string, proposals: NameProposal[]): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Proposte')
  ws.columns = COLUMNS.map((c) => ({ ...c }))
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  proposals.forEach((p, i) => {
    const row = ws.addRow({
      group: i + 1,
      variants: p.variants.map((v) => `${v.name} (${v.occurrences})`).join(VARIANT_SEP),
      occurrences: p.occurrences,
      counts: TIPS.filter((t) => p.counts[t]).map((t) => `${t}:${p.counts[t]}`).join(' '),
      reasons: isUnchanged(p) ? '' : p.reasons.join(', ') || 'raggruppati',
      proposedName: p.canonical,
      proposedTip: p.tip ?? '',
      accept: 'S',
      finalName: p.canonical,
      finalTip: p.tip ?? '',
    })
    if (!isUnchanged(p)) row.getCell('finalName').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
    row.getCell('finalTip').dataValidation = { type: 'list', allowBlank: true, formulae: [`"${TIPS.join(',')}"`] }
    row.getCell('accept').dataValidation = { type: 'list', allowBlank: false, formulae: ['"S,N"'] }
  })

  const legend = wb.addWorksheet('Legenda')
  legend.addRows([
    ['Come compilare'],
    ['accetta = S: le varianti diventano un solo prodotto con il "nome finale" (le varianti restano come sinonimi).'],
    ['accetta = N: le varianti restano separate e con il nome originale.'],
    ['nome finale: correggilo liberamente (minuscolo, per esteso).'],
    ['tip finale: cambialo solo se il tip proposto è sbagliato; diventa una correzione manuale.'],
    [],
    ['tip', 'significato'],
    ...TIPS.map((t) => [t, TIP_LABELS[t]]),
  ])
  legend.getColumn(1).width = 12
  legend.getColumn(2).width = 90
  await wb.xlsx.writeFile(path)
}

function text(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'richText' in v) return v.richText.map((t) => t.text).join('')
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '')
  return String(v)
}

export async function readDecisions(path: string): Promise<NameDecision[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  const ws = wb.getWorksheet('Proposte')
  if (!ws) throw new Error(`${path}: foglio "Proposte" mancante`)
  const col = (key: string) => COLUMNS.findIndex((c) => c.key === key) + 1

  const decisions: NameDecision[] = []
  const errors: string[] = []
  ws.eachRow((row, n) => {
    if (n === 1) return
    const variants = text(row.getCell(col('variants')).value)
      .split(VARIANT_SEP)
      .map((v) => v.replace(/\s*\(\d+\)\s*$/, '').trim())
      .filter(Boolean)
    if (!variants.length) return
    const accept = text(row.getCell(col('accept')).value).trim().toUpperCase()
    if (accept !== 'S' && accept !== 'N') errors.push(`riga ${n}: "accetta" deve essere S o N`)
    const proposedTip = text(row.getCell(col('proposedTip')).value).trim().toLowerCase()
    const finalTip = text(row.getCell(col('finalTip')).value).trim().toLowerCase()
    if (finalTip && !isTip(finalTip)) errors.push(`riga ${n}: tip finale "${finalTip}" non valido`)
    const finalName = text(row.getCell(col('finalName')).value).trim()
    if (accept === 'S' && !finalName) errors.push(`riga ${n}: nome finale vuoto`)
    decisions.push({
      variants,
      accept: accept === 'S',
      finalName,
      proposedTip: isTip(proposedTip) ? proposedTip : null,
      finalTip: isTip(finalTip) ? (finalTip as Tip) : null,
    })
  })
  if (errors.length) throw new Error(`Errori nel file delle proposte:\n  ${errors.join('\n  ')}`)
  return decisions
}
