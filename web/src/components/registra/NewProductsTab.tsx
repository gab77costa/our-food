import { expiryRequired, localToday, type HintIndex, type Session, type Tip } from '@ourfoodhub/core'
import { useState } from 'react'
import { useUser } from '../../auth'
import { aiEnabled } from '../../firebase'
import { categorizeWithAi, saveDrafts, type Draft } from '../../data/mutations'
import { useDictation } from '../../lib/speech'
import { ErrorBox, TipPicker, type ToastMessage } from '../ui'
import { draftFromPhrase, emptyDraft, useDrafts, withSuggestion } from './drafts'

const SOURCE_LABEL: Record<string, string> = {
  history: 'dallo storico',
  similar: 'da un nome simile',
  keyword: 'da parola chiave',
  llm: 'suggerito dall’AI: controlla',
  manual: 'scelto da te',
}

interface Props {
  session: Session
  hints: { index: HintIndex }
  onToast: (t: ToastMessage) => void
}

export function NewProductsTab({ session, hints, onToast }: Props) {
  const user = useUser()
  const [drafts, setDrafts] = useDrafts(session.id)
  const [busy, setBusy] = useState(false)
  const [aiAsked, setAiAsked] = useState(false)
  const dictation = useDictation((text) => setDrafts((ds) => [draftFromPhrase(text, localToday(), hints.index), ...ds]))

  const update = (key: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  const remove = (key: string) => setDrafts((ds) => ds.filter((d) => d.key !== key))

  const saveAll = async () => {
    if (drafts.some((d) => !d.name.trim())) return onToast({ text: 'C’è un prodotto senza nome', kind: 'error' })
    const missingTip = drafts.filter((d) => !d.tip)

    // One AI call per session, only for names the history doesn't know.
    if (aiEnabled && missingTip.length && !aiAsked && navigator.onLine) {
      setBusy(true)
      setAiAsked(true)
      try {
        const tips = await categorizeWithAi([...new Set(missingTip.map((d) => d.name.trim()))])
        setDrafts((ds) => ds.map((d) => (!d.tip && tips.get(d.name.trim()) ? { ...d, tip: tips.get(d.name.trim())!, tipSource: 'llm' } : d)))
        if (tips.size) return onToast({ text: `Categoria suggerita dall’AI per ${tips.size} prodotti: controlla e premi di nuovo Salva` })
      } catch {
        onToast({ text: 'AI non raggiungibile: scegli la categoria a mano o salva come "da categorizzare"', kind: 'error' })
        return
      } finally {
        setBusy(false)
      }
    }

    const stillMissing = drafts.filter((d) => !d.tip).length
    if (stillMissing && !confirm(`${stillMissing} prodotti senza categoria: salvarli come "da categorizzare"?`)) return
    const noDate = drafts.filter((d) => !d.expiryDate && expiryRequired(d.tip)).length
    if (noDate && !confirm(`${noDate} prodotti senza data di scadenza: salvare comunque?`)) return

    setBusy(true)
    try {
      // The list shows the newest first; save in dictation order (it is the Excel row order).
      await saveDrafts(session.id, [...drafts].reverse(), user, hints.index)
      onToast({ text: `${drafts.length} prodotti salvati` })
      setDrafts([])
      setAiAsked(false)
    } catch (e) {
      onToast({ text: `Errore nel salvataggio: ${String(e)}`, kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {dictation.supported ? (
        <button
          className={`btn w-full py-5 text-lg text-white ${dictation.listening ? 'animate-pulse bg-red-600' : 'bg-brand-600'}`}
          onClick={dictation.listening ? dictation.stop : dictation.start}
        >
          {dictation.listening ? '⏹ Ferma dettatura' : '🎤 Detta i prodotti'}
        </button>
      ) : (
        <ErrorBox>Dettatura non supportata da questo browser: usa Chrome su Android o l’inserimento manuale.</ErrorBox>
      )}
      {dictation.listening && (
        <div className="card min-h-12 px-3 py-2 text-sm text-slate-500 italic">{dictation.interim || 'In ascolto… un prodotto per frase, es. “kefir sei pezzi 19 novembre”'}</div>
      )}
      {dictation.error && <ErrorBox>{dictation.error}</ErrorBox>}

      <button className="btn-secondary w-full" onClick={() => setDrafts((ds) => [emptyDraft(), ...ds])}>
        + Aggiungi a mano
      </button>

      {drafts.map((d) => (
        <DraftCard
          key={d.key}
          draft={d}
          onChange={(patch) => update(d.key, patch)}
          onNameDone={() => setDrafts((ds) => ds.map((x) => (x.key === d.key ? withSuggestion(x, hints.index) : x)))}
          onRemove={() => remove(d.key)}
        />
      ))}

      {drafts.length > 0 && (
        <div className="sticky bottom-3 pt-2">
          <button className="btn-primary w-full py-3 text-base shadow-lg" disabled={busy} onClick={saveAll}>
            {busy ? 'Attendi…' : `💾 Salva tutti (${drafts.length})`}
          </button>
        </div>
      )}
    </div>
  )
}

function DraftCard({
  draft: d,
  onChange,
  onNameDone,
  onRemove,
}: {
  draft: Draft
  onChange: (p: Partial<Draft>) => void
  onNameDone: () => void
  onRemove: () => void
}) {
  const needsDate = expiryRequired(d.tip) && !d.expiryDate
  return (
    <div className={`card space-y-2 p-3 ${d.tipSource === 'llm' ? 'ring-2 ring-amber-400' : ''}`}>
      {d.raw && <div className="truncate text-xs text-slate-400">“{d.raw}”</div>}
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Nome prodotto"
          value={d.name}
          onChange={(e) => onChange({ name: e.target.value })}
          onBlur={onNameDone}
        />
        <input
          className="input w-16 text-center"
          type="number"
          min={1}
          aria-label="Quantità"
          value={d.quantity}
          onChange={(e) => onChange({ quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
        />
        <button className="px-2 text-slate-400 hover:text-red-600" onClick={onRemove} aria-label="Rimuovi">
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          className={`input w-auto ${needsDate || d.invalidDate ? 'border-amber-500' : ''}`}
          type="date"
          aria-label="Scadenza"
          value={d.expiryDate ?? ''}
          onChange={(e) => onChange({ expiryDate: e.target.value || null, invalidDate: false })}
        />
        <span className="text-xs text-amber-700 dark:text-amber-300">
          {d.invalidDate ? 'data dettata inesistente' : needsDate ? 'manca la scadenza' : ''}
        </span>
      </div>
      <TipPicker value={d.tip} onChange={(tip: Tip) => onChange({ tip, tipSource: 'manual' })} compact />
      <div className="text-xs text-slate-500">{d.tip ? SOURCE_LABEL[d.tipSource ?? 'manual'] : 'categoria da scegliere'}</div>
    </div>
  )
}
