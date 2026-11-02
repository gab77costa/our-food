import { hintTip, normalizeName, TIP_ICONS, TIPS, type CategoryHint } from '@ourfoodhub/core'
import { useMemo, useState } from 'react'
import { useHints } from '../../data/hooks'
import { deleteHint, renameHint, setHintOverride } from '../../data/mutations'
import { EditableText, ErrorBox, Spinner, TipSelect, type ToastMessage } from '../ui'

const PAGE = 100

/** Names learned from the history and from every saved product, with their usual tip. */
export function HintsTable({ onToast }: { onToast: (t: ToastMessage) => void }) {
  const hints = useHints()
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const rows = useMemo(() => {
    const q = normalizeName(search)
    return hints.data
      .filter((h) => !q || normalizeName(h.displayName).includes(q) || h.aliases.some((a) => a.includes(q)))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [hints.data, search])

  const safe = (fn: () => Promise<unknown>) => fn().catch((e) => onToast({ text: `Errore: ${String(e)}`, kind: 'error' }))

  if (hints.loading) return <Spinner />
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Servono a proporre il tipo quando detti un prodotto. Il tipo “forzato” vince sempre sui conteggi; i sinonimi sono le grafie alternative (abbreviazioni dello storico).
      </p>
      {hints.error && <ErrorBox>{hints.error}</ErrorBox>}
      <input className="input max-w-64" placeholder="Cerca un nome…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase dark:bg-slate-900">
            <tr>
              <th className="px-2 py-2">Nome</th>
              <th className="px-2 py-2">Sinonimi</th>
              <th className="px-2 py-2">Conteggi</th>
              <th className="px-2 py-2">Tipo proposto</th>
              <th className="px-2 py-2">Tipo forzato</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.slice(0, limit).map((h) => (
              <HintRow key={h.id} hint={h} safe={safe} />
            ))}
          </tbody>
        </table>
        {rows.length > limit && (
          <button className="btn-secondary m-3" onClick={() => setLimit((l) => l + PAGE)}>
            Mostra altri ({rows.length - limit})
          </button>
        )}
      </div>
    </div>
  )
}

function HintRow({ hint: h, safe }: { hint: CategoryHint; safe: (fn: () => Promise<unknown>) => unknown }) {
  const tip = hintTip(h)
  return (
    <tr>
      <td className="px-2 py-1">
        <EditableText value={h.displayName} onCommit={(v) => v.trim() && safe(() => renameHint(h, v))} />
      </td>
      <td className="max-w-64 truncate px-2 py-1 text-xs text-slate-500" title={h.aliases.join(', ')}>
        {h.aliases.join(', ')}
      </td>
      <td className="px-2 py-1 text-xs whitespace-nowrap text-slate-500">
        {TIPS.filter((t) => h.counts[t]).map((t) => `${TIP_ICONS[t]}${h.counts[t]}`).join('  ')}
      </td>
      <td className="px-2 py-1">{tip ? TIP_ICONS[tip] : '—'}</td>
      <td className="px-2 py-1">
        <TipSelect className="w-auto" value={h.override} onChange={(t) => safe(() => setHintOverride(h, t))} />
      </td>
      <td className="px-2 py-1 text-right">
        <button
          className="text-xs text-slate-400 hover:text-red-600"
          onClick={() => confirm(`Dimenticare "${h.displayName}"?`) && safe(() => deleteHint(h))}
        >
          Elimina
        </button>
      </td>
    </tr>
  )
}
