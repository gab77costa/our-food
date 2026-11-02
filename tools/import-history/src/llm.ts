/**
 * Optional (--llm): asks Claude for the full, correctly spelled name of each
 * historical name. Used only to improve the proposals that the user reviews.
 * Needs ANTHROPIC_API_KEY (or an `ant auth login` profile) on this PC.
 */
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { normalizeName } from '@ourfoodhub/core'
import { z } from 'zod'

const MODEL = 'claude-opus-5-5'
const CHUNK = 150

const Result = z.object({
  items: z.array(z.object({ original: z.string(), canonical: z.string() })),
})

const INSTRUCTIONS = `Sono nomi di prodotti alimentari scritti a mano in una lista della dispensa di una famiglia italiana.
Molti sono abbreviati ("zucca grigl", "pecorino gratt", "budino soia ciocc"), hanno refusi ("albococche", "sicilaini")
o contengono marche ("polpa cirio", "tortelli rana").

Per ogni nome restituisci il nome canonico:
- in minuscolo, per esteso e scritto correttamente ("zucca grigliata", "pecorino grattugiato", "albicocche");
- concordato al genere e numero del sostantivo ("finocchi grigliati");
- mantieni marche, varianti e dettagli: non unire prodotti diversi ("broccoli lessati" resta diverso da "broccoletti");
- se il nome è già corretto, restituiscilo invariato; se un'abbreviazione è ambigua, lasciala com'è.

Restituisci esattamente un elemento per ogni nome ricevuto, con "original" identico all'input.`

export async function suggestCanonicalNames(names: string[]): Promise<Map<string, string>> {
  const client = new Anthropic()
  const out = new Map<string, string>()

  for (let i = 0; i < names.length; i += CHUNK) {
    const chunk = names.slice(i, i + CHUNK)
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(Result) },
      messages: [{ role: 'user', content: `${INSTRUCTIONS}\n\nNomi:\n${chunk.map((n) => `- ${n}`).join('\n')}` }],
    })
    if (response.stop_reason === 'refusal') throw new Error('Richiesta rifiutata dal modello')
    if (response.stop_reason === 'max_tokens') throw new Error('Risposta troncata (max_tokens): riduci CHUNK')
    const parsed = response.parsed_output
    if (!parsed) throw new Error('Risposta del modello non valida')
    const asked = new Set(chunk)
    for (const item of parsed.items) {
      const original = normalizeName(item.original)
      const canonical = normalizeName(item.canonical)
      if (asked.has(original) && canonical) out.set(original, canonical)
    }
    process.stdout.write(`  LLM: ${Math.min(i + CHUNK, names.length)}/${names.length} nomi\n`)
  }
  return out
}
