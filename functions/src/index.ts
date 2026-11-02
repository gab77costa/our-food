import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { classify, TIPS, type Example, type Tip } from './classify.js'

initializeApp()
setGlobalOptions({ region: 'europe-west8', maxInstances: 2 })

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')
const MAX_NAMES = 60
const EXAMPLES = 80

interface Request {
  names: string[]
}

/**
 * Suggests the tip for products the app could not categorize from the history.
 * Called once at the end of a session, only for the leftovers.
 */
export const categorizeProducts = onCall<Request>(
  { secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, memory: '256MiB' },
  async (req) => {
    const email = req.auth?.token.email?.toLowerCase()
    if (!email || req.auth?.token.email_verified !== true) throw new HttpsError('unauthenticated', 'Accesso richiesto')
    const db = getFirestore()
    const allowed = await db.doc(`allowedUsers/${email}`).get()
    if (!allowed.exists) throw new HttpsError('permission-denied', 'Utente non autorizzato')

    const names = req.data?.names
    if (
      !Array.isArray(names) ||
      names.length === 0 ||
      names.length > MAX_NAMES ||
      !names.every((n) => typeof n === 'string' && n.trim().length > 0 && n.length <= 120)
    ) {
      throw new HttpsError('invalid-argument', `Servono da 1 a ${MAX_NAMES} nomi`)
    }

    const hints = await db.collection('categoryHints').orderBy('lastSeen', 'desc').limit(EXAMPLES).get()
    const examples: Example[] = []
    for (const doc of hints.docs) {
      const tip = hintTip(doc.data())
      if (tip) examples.push({ name: String(doc.get('displayName')), tip })
    }

    try {
      const result = await classify(ANTHROPIC_API_KEY.value(), [...new Set(names)], examples)
      return { results: names.map((name) => ({ name, tip: result.get(name) ?? null })) }
    } catch (e) {
      logger.error('categorizeProducts failed', e)
      throw new HttpsError('unavailable', 'Categorizzazione automatica non disponibile, scegli a mano')
    }
  },
)

function hintTip(data: FirebaseFirestore.DocumentData): Tip | null {
  if (TIPS.includes(data.override)) return data.override as Tip
  let best: Tip | null = null
  let bestCount = 0
  for (const t of TIPS) {
    const c = Number(data.counts?.[t] ?? 0)
    if (c > bestCount) {
      best = t
      bestCount = c
    }
  }
  return best
}
