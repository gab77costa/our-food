import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'

export const TIPS = ['v', 'f', 'c', 'd', 'b'] as const
export type Tip = (typeof TIPS)[number]

export const MODEL = 'claude-opus-5-5'

const Result = z.object({
  items: z.array(z.object({ name: z.string(), tip: z.enum(TIPS) })),
})

export interface Example {
  name: string
  tip: Tip
}

export function buildPrompt(names: string[], examples: Example[]): string {
  return `Classifica prodotti alimentari della dispensa di una famiglia italiana in base a DOVE vengono conservati.

Codici:
- v = frutta e verdura fresca, non in frigo (banane, mele, pomodori, zucchine)
- f = frigorifero (latticini, salumi, uova, piatti pronti freschi, verdure già cotte o grigliate, pasta fresca)
- c = congelatore (surgelati, gelati, pesce o carne congelati)
- d = dispensa (pasta secca, legumi in scatola, biscotti, conserve, brodi, cracker)
- b = bevande (succhi, latte vegetale, acqua, vino, birra)

Esempi dallo storico di questa famiglia (usa le stesse abitudini):
${examples.map((e) => `- ${e.name} → ${e.tip}`).join('\n') || '(nessuno)'}

Prodotti da classificare (restituisci un elemento per ciascuno, con "name" identico all'input):
${names.map((n) => `- ${n}`).join('\n')}`
}

export async function classify(apiKey: string, names: string[], examples: Example[]): Promise<Map<string, Tip>> {
  const client = new Anthropic({ apiKey })
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(Result) },
    messages: [{ role: 'user', content: buildPrompt(names, examples) }],
  })
  if (response.stop_reason === 'refusal') throw new Error('refusal')
  const parsed = response.parsed_output
  if (!parsed) throw new Error(`invalid output (stop_reason ${response.stop_reason})`)
  const asked = new Set(names)
  const out = new Map<string, Tip>()
  for (const item of parsed.items) if (asked.has(item.name)) out.set(item.name, item.tip)
  return out
}
