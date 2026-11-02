/**
 * History import for OurFoodHub.
 *
 *   propose <cartella>             legge gli Excel e crea out/proposte-nomi.xlsx da rivedere
 *   apply   <cartella> [opzioni]   applica le decisioni, verifica e scrive su Firestore
 *   allow   <email>    [opzioni]   autorizza un account Google
 *
 * Opzioni: --llm (propose), --proposals <file>, --dry-run, --force,
 *          --project <id> (default: ourfoodhub), --emulator (scrive nell'emulatore locale invece che nel cloud)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { isUnchanged, proposeNameGroups } from '@ourfoodhub/core'
import { buildImport, collectNameStats } from './build.ts'
import { loadSnapshots } from './files.ts'
import { allowUser, connect, existingCounts, writeImport } from './firestore.ts'
import { suggestCanonicalNames } from './llm.ts'
import { readDecisions, writeProposals } from './proposals.ts'

const OUT = resolve(import.meta.dirname, '../out')
const DEFAULT_PROPOSALS = join(OUT, 'proposte-nomi.xlsx')

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    llm: { type: 'boolean', default: false },
    proposals: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    project: { type: 'string', default: 'ourfoodhub' },
    emulator: { type: 'boolean', default: false },
  },
})

const [command, arg] = positionals
const proposalsPath = values.proposals ? resolve(process.env.INIT_CWD ?? process.cwd(), values.proposals) : DEFAULT_PROPOSALS
const target = { project: values.project!, emulator: values.emulator! }
const where = target.emulator ? `emulatore (progetto ${target.project})` : `cloud (progetto ${target.project})`

async function propose(dir: string) {
  const snapshots = await loadSnapshots(dir)
  printWarnings(snapshots)
  const stats = collectNameStats(snapshots)
  console.log(`\n${snapshots.length} file, ${snapshots.reduce((n, s) => n + s.rows.length, 0)} righe, ${stats.length} nomi distinti`)

  let expand: ((n: string) => string) | undefined
  if (values.llm) {
    console.log('Chiedo a Claude i nomi per esteso (una chiamata ogni 150 nomi)...')
    const suggestions = await suggestCanonicalNames(stats.map((s) => s.name))
    expand = (n) => suggestions.get(n) ?? n
  }
  const proposals = proposeNameGroups(stats, { expand })
  mkdirSync(OUT, { recursive: true })
  await writeProposals(proposalsPath, proposals)
  const changed = proposals.filter((p) => !isUnchanged(p)).length
  console.log(`\n${proposals.length} gruppi, di cui ${changed} con modifiche proposte (in cima al file, evidenziate).`)
  console.log(`File da rivedere: ${proposalsPath}`)
  console.log(`Poi: npm run import -- apply "${dir}"`)
}

async function apply(dir: string) {
  const snapshots = await loadSnapshots(dir)
  printWarnings(snapshots)
  const decisions = await readDecisions(proposalsPath)
  const plan = buildImport(snapshots, decisions)
  const { stats } = plan.reconstruction

  console.log(`\nSessioni: ${stats.snapshots} · prodotti: ${stats.products} (attivi ${stats.active}, consumati ${stats.consumed})`)
  console.log(`Cambi di quantità: ${stats.quantityChanges} · nomi appresi: ${plan.hints.length}`)
  const last = plan.reconstruction.sessions.at(-1)!
  console.log(`Dispensa attuale = file del ${last.date} (${stats.active} prodotti)`)

  const v = plan.verification
  if (v.mismatches.length) {
    console.error(`\n✗ Verifica fallita: ${v.mismatches.length}/${v.sessionsChecked} file non si ricostruiscono uguali:`)
    for (const m of v.mismatches.slice(0, 5)) console.error(`  ${m.session}`)
    writeFileSync(join(OUT, 'verifica-errori.json'), JSON.stringify(v.mismatches, null, 2))
    console.error(`Dettagli: ${join(OUT, 'verifica-errori.json')}`)
    process.exitCode = 1
    return
  }
  console.log(`✓ Verifica: tutti i ${v.sessionsChecked} file si ricostruiscono identici (con i nomi finali)`)

  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'anteprima.json'), JSON.stringify({ ...plan.reconstruction, hints: plan.hints }, null, 2))
  console.log(`Anteprima: ${join(OUT, 'anteprima.json')}`)
  if (values['dry-run']) return console.log('--dry-run: niente scritto.')

  const db = connect(target)
  const existing = await existingCounts(db)
  if ((existing.products || existing.sessions) && !values.force) {
    throw new Error(`Il database (${where}) contiene già dati. Usa --force per sovrascrivere i documenti importati.`)
  }
  console.log(`\nScrivo su ${where}...`)
  await writeImport(db, { sessions: plan.reconstruction.sessions, products: plan.reconstruction.products, hints: plan.hints })
  console.log('✓ Import completato.')
}

async function allow(email: string) {
  const id = await allowUser(connect(target), email)
  console.log(`✓ ${id} autorizzato su ${where}`)
}

function printWarnings(snapshots: Awaited<ReturnType<typeof loadSnapshots>>) {
  for (const s of snapshots) {
    if (!s.warnings.length) continue
    console.warn(`⚠ ${s.file}:`)
    for (const w of s.warnings) console.warn(`    ${w}`)
  }
}

// npm runs workspace scripts from the package folder: resolve paths from where the command was typed.
const fromCwd = (p: string) => resolve(process.env.INIT_CWD ?? process.cwd(), p)

async function main() {
  if (command === 'propose' && arg) return propose(fromCwd(arg))
  if (command === 'apply' && arg) return apply(fromCwd(arg))
  if (command === 'allow' && arg) return allow(arg)
  console.log('Uso: npm run import -- propose <cartella> [--llm]')
  console.log('     npm run import -- apply <cartella> [--dry-run] [--force] [--project <id>] [--emulator]')
  console.log('     npm run import -- allow <email> [--project <id>] [--emulator]')
  process.exitCode = 2
}

main().catch((e: unknown) => {
  console.error(`\n✗ ${e instanceof Error ? e.message : String(e)}`)
  process.exitCode = 1
})
