/** Products dictated but not saved yet: kept on the device so a reload doesn't lose them. */
import { parseUtterance, suggestTip, type HintIndex, type IsoDate } from '@ourfoodhub/core'
import { useEffect, useState } from 'react'
import type { Draft, TipSource } from '../../data/mutations'

const key = (sessionId: string) => `ofh-drafts-${sessionId}`

function load(sessionId: string): Draft[] {
  try {
    const raw = localStorage.getItem(key(sessionId))
    return raw ? (JSON.parse(raw) as Draft[]) : []
  } catch {
    return []
  }
}

function save(sessionId: string, drafts: Draft[]) {
  try {
    if (drafts.length) localStorage.setItem(key(sessionId), JSON.stringify(drafts))
    else localStorage.removeItem(key(sessionId))
  } catch {
    // storage unavailable: drafts live only in memory
  }
}

export function hasDrafts(sessionId: string): boolean {
  return load(sessionId).length > 0
}

export function useDrafts(sessionId: string) {
  const [drafts, setDrafts] = useState<Draft[]>(() => load(sessionId))
  useEffect(() => save(sessionId, drafts), [sessionId, drafts])
  return [drafts, setDrafts] as const
}

let counter = 0
const newKey = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`

/** Local suggestion (history, similar names, keywords); exact aliases also fix the name. */
export function withSuggestion(d: Draft, index: HintIndex): Draft {
  if (d.tipSource === 'manual' || d.tipSource === 'llm') return d
  const s = suggestTip(d.name, index)
  if (!s) return { ...d, tip: null, tipSource: null }
  const name = s.source === 'history' && s.canonicalName ? s.canonicalName : d.name
  return { ...d, name, tip: s.tip, tipSource: s.source as TipSource }
}

export function draftFromPhrase(raw: string, today: IsoDate, index: HintIndex): Draft {
  const p = parseUtterance(raw, today)
  return withSuggestion(
    { key: newKey(), raw, name: p.name, quantity: p.quantity, expiryDate: p.expiryDate, invalidDate: p.invalidDate, tip: null, tipSource: null },
    index,
  )
}

export function emptyDraft(): Draft {
  return { key: newKey(), raw: '', name: '', quantity: 1, expiryDate: null, invalidDate: false, tip: null, tipSource: null }
}
