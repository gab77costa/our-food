import { normalizeName, SHEETS, TIP_LABELS, type Product, type Session, type Tip } from '@ourfoodhub/core'
import { useMemo, useState } from 'react'
import { useUser } from '../../auth'
import { useActiveProducts, useHints, useSessionConsumed } from '../../data/hooks'
import { consumeProducts, restoreProducts, updateProduct } from '../../data/mutations'
import { ErrorBox, Spinner, TipIcon, type ToastMessage } from '../ui'
import { ProductLine } from './ProductLine'

const TIP_ORDER: Array<Tip | null> = [...SHEETS.flatMap((s) => s.tips), null]

export function ConsumeTab({ session, onToast }: { session: Session; onToast: (t: ToastMessage) => void }) {
  const user = useUser()
  const active = useActiveProducts()
  const consumed = useSessionConsumed(session.id)
  const { index } = useHints()
  const [search, setSearch] = useState('')

  const groups = useMemo(() => {
    const q = normalizeName(search)
    const list = q ? active.data.filter((p) => p.nameKey.includes(q)) : active.data
    return TIP_ORDER.map((tip) => ({ tip, items: list.filter((p) => p.tip === tip) })).filter((g) => g.items.length)
  }, [active.data, search])

  const consume = async (p: Product) => {
    try {
      await consumeProducts([p], session.id, user)
      onToast({ text: `${p.name}: consumato`, action: { label: 'Annulla', run: () => void restoreProducts([{ ...p, consumedInSessionId: session.id }]) } })
    } catch (e) {
      onToast({ text: String(e), kind: 'error' })
    }
  }

  const decrement = (p: Product) => updateProduct(p, { quantity: p.quantity - 1 }, index)

  if (active.loading) return <Spinner />
  return (
    <div className="space-y-3">
      {active.error && <ErrorBox>{active.error}</ErrorBox>}
      <input className="input" placeholder="Cerca nella dispensa…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <p className="text-xs text-slate-500">Tocca ✓ sui prodotti finiti. Con −1 riduci la quantità di una confezione multipla.</p>

      {groups.map((g) => (
        <section key={g.tip ?? 'none'} className="card divide-y divide-slate-100 dark:divide-slate-800">
          <h2 className="flex items-center gap-2 px-3 py-2 text-sm font-semibold">
            <TipIcon tip={g.tip} size="lg" />
            {g.tip ? TIP_LABELS[g.tip] : 'Da categorizzare'}
            <span className="font-normal text-slate-500">· {g.items.length}</span>
          </h2>
          {g.items.map((p) => (
            <ProductLine
              key={p.id}
              product={p}
              actions={
                <div className="flex gap-1">
                  {p.quantity > 1 && (
                    <button className="btn-secondary px-2 py-1" onClick={() => decrement(p)} aria-label={`Togli uno da ${p.name}`}>
                      −1
                    </button>
                  )}
                  <button className="btn-primary px-3 py-1" onClick={() => consume(p)} aria-label={`${p.name} consumato`}>
                    ✓
                  </button>
                </div>
              }
            />
          ))}
        </section>
      ))}
      {!groups.length && <p className="py-6 text-center text-sm text-slate-500">Nessun prodotto in dispensa.</p>}

      {consumed.data.length > 0 && (
        <section className="card divide-y divide-slate-100 opacity-80 dark:divide-slate-800">
          <h2 className="px-3 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Consumati in questa spesa · {consumed.data.length}</h2>
          {consumed.data.map((p) => (
            <ProductLine
              key={p.id}
              product={p}
              actions={
                <button className="btn-secondary px-2 py-1 text-xs" onClick={() => restoreProducts([p])}>
                  Ripristina
                </button>
              }
            />
          ))}
        </section>
      )}
    </div>
  )
}
