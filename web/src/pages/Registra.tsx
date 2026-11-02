import { expiryStatus, isSessionEmpty, localToday, type Session } from '@ourfoodhub/core'
import { useState } from 'react'
import { useUser } from '../auth'
import { ConsumeTab } from '../components/registra/ConsumeTab'
import { NewProductsTab } from '../components/registra/NewProductsTab'
import { ProductLine } from '../components/registra/ProductLine'
import { ErrorBox, formatDate, Spinner, Toast, useToast } from '../components/ui'
import { fetchAllProducts, useActiveProducts, useHints, useTodaySession } from '../data/hooks'
import { closeSession, discardSession, openSession } from '../data/mutations'
import { hasDrafts } from '../components/registra/drafts'
import { downloadSessionFile } from '../lib/download'

export function Registra() {
  const { session, loading, today } = useTodaySession()
  const { toast, show } = useToast()

  if (loading) return <Spinner />
  return (
    <>
      {session?.status === 'open' ? (
        <OpenSession session={session} onToast={show} />
      ) : (
        <StartSession today={today} session={session} onToast={show} />
      )}
      <Toast toast={toast} onClose={() => show(null)} />
    </>
  )
}

type ShowToast = ReturnType<typeof useToast>['show']

async function download(session: Session, onToast: ShowToast) {
  try {
    await downloadSessionFile(session, await fetchAllProducts())
  } catch (e) {
    onToast({ text: `Impossibile creare il file: ${String(e)}`, kind: 'error' })
  }
}

function StartSession({ today, session, onToast }: { today: string; session: Session | null; onToast: ShowToast }) {
  const user = useUser()
  const active = useActiveProducts()
  const [busy, setBusy] = useState(false)
  const day = localToday()
  const expired = active.data.filter((p) => expiryStatus(p.expiryDate, day) === 'expired')
  const soon = active.data.filter((p) => expiryStatus(p.expiryDate, day) === 'soon')

  const start = async () => {
    setBusy(true)
    try {
      await openSession(today, session, user)
    } catch (e) {
      onToast({ text: `Errore: ${String(e)}`, kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <button className="btn-primary w-full py-4 text-lg" disabled={busy} onClick={start}>
        {session ? '🛒 Riapri la spesa di oggi' : '🛒 Nuova spesa'}
      </button>
      {session && (
        <button className="btn-secondary w-full" onClick={() => download(session, onToast)}>
          ⬇ Scarica Excel di oggi
        </button>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat n={active.data.length} label="in dispensa" />
        <Stat n={expired.length} label="scaduti" tone="text-red-600" />
        <Stat n={soon.length} label="entro 7 giorni" tone="text-amber-600" />
      </div>

      {active.error && <ErrorBox>{active.error}</ErrorBox>}
      {[...expired, ...soon].length > 0 && (
        <section className="card divide-y divide-slate-100 dark:divide-slate-800">
          <h2 className="px-3 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Da consumare presto</h2>
          {[...expired, ...soon]
            .sort((a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''))
            .map((p) => (
              <ProductLine key={p.id} product={p} />
            ))}
        </section>
      )}
      <p className="text-center text-xs text-slate-400">Oggi è {formatDate(today)}</p>
    </div>
  )
}

function Stat({ n, label, tone = '' }: { n: number; label: string; tone?: string }) {
  return (
    <div className="card py-3">
      <div className={`text-2xl font-bold ${tone}`}>{n}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}

function OpenSession({ session, onToast }: { session: Session; onToast: ShowToast }) {
  const [tab, setTab] = useState<'consumati' | 'nuovi'>('consumati')
  const hints = useHints()
  const active = useActiveProducts()
  const empty = !active.loading && isSessionEmpty(session, active.data)

  const close = async () => {
    try {
      if (empty) {
        if (hasDrafts(session.id)) return onToast({ text: 'Salva prima i prodotti dettati: una spesa vuota non si registra', kind: 'error' })
        if (!confirm('Nessun prodotto aggiunto o consumato: la spesa non verrà registrata. Annullarla?')) return
        await discardSession(session.id)
        return onToast({ text: 'Spesa vuota annullata' })
      }
      if (hasDrafts(session.id) && !confirm('Ci sono prodotti dettati non ancora salvati. Chiudere comunque la spesa?')) return
      await closeSession(session.id)
      onToast({ text: 'Spesa chiusa', action: { label: 'Scarica Excel', run: () => download({ ...session, closedAt: Date.now() }, onToast) } })
    } catch (e) {
      onToast({ text: `Errore: ${String(e)}`, kind: 'error' })
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">Spesa in corso</div>
          <div className="font-semibold">{formatDate(session.date)}</div>
        </div>
        <button className="btn-secondary" disabled={active.loading} onClick={close}>
          {empty ? '✕ Annulla spesa' : '✓ Chiudi spesa'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
        {(['consumati', 'nuovi'] as const).map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg py-2 text-sm font-medium ${tab === t ? 'bg-white shadow dark:bg-slate-950' : 'text-slate-600 dark:text-slate-300'}`}
          >
            {i + 1}. {t === 'consumati' ? 'Togli i consumati' : 'Aggiungi i nuovi'}
          </button>
        ))}
      </div>

      {tab === 'consumati' ? (
        <ConsumeTab session={session} onToast={onToast} />
      ) : (
        <NewProductsTab session={session} hints={hints} onToast={onToast} />
      )}
    </div>
  )
}
