import {
  daysUntil,
  expiryStatus,
  isValidIsoDate,
  localToday,
  normalizeName,
  TIP_ICONS,
  TIP_LABELS,
  TIPS,
  type Product,
  type Tip,
} from '@ourfoodhub/core'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useUser } from '../../auth'
import { useActiveProducts, useAllProducts, useHints } from '../../data/hooks'
import { consumeProducts, deleteProducts, restoreProducts, updateProduct, updateProducts } from '../../data/mutations'
import { EditableText, ErrorBox, ExpiryBadge, formatDateTime, Spinner, TipSelect, type ToastMessage } from '../ui'

type TipFilter = Tip | 'none' | 'all'
type ExpiryFilter = 'all' | 'expired' | 'soon'

const col = createColumnHelper<Product>()

export function ProductsTable({ onToast }: { onToast: (t: ToastMessage) => void }) {
  const user = useUser()
  const [showConsumed, setShowConsumed] = useState(false)
  const active = useActiveProducts()
  const all = useAllProducts(showConsumed)
  const { index } = useHints()
  const source = showConsumed ? all : active

  const [search, setSearch] = useState('')
  const [tipFilter, setTipFilter] = useState<TipFilter>('all')
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('all')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'expiryDate', desc: false }])
  const [selection, setSelection] = useState<RowSelectionState>({})

  const today = localToday()
  const data = useMemo(() => {
    const q = normalizeName(search)
    return source.data.filter(
      (p) =>
        (!q || p.nameKey.includes(q)) &&
        (tipFilter === 'all' || (tipFilter === 'none' ? p.tip === null : p.tip === tipFilter)) &&
        (expiryFilter === 'all' || (p.status === 'active' && expiryStatus(p.expiryDate, today) === expiryFilter)),
    )
  }, [source.data, search, tipFilter, expiryFilter, today])

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
      onToast({ text: label })
    } catch (e) {
      onToast({ text: `Errore: ${String(e)}`, kind: 'error' })
    }
  }

  const columns = useMemo(
    () => [
      col.display({
        id: 'select',
        header: ({ table }) => (
          <input type="checkbox" aria-label="Seleziona tutti" checked={table.getIsAllRowsSelected()} onChange={table.getToggleAllRowsSelectedHandler()} />
        ),
        cell: ({ row }) => <input type="checkbox" aria-label="Seleziona" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />,
      }),
      col.accessor('tip', {
        header: 'Tipo',
        sortingFn: (a, b) => (a.original.tip ?? 'z').localeCompare(b.original.tip ?? 'z'),
        cell: ({ row }) => (
          <TipSelect className="min-w-36" value={row.original.tip} onChange={(tip) => updateProduct(row.original, { tip }, index)} />
        ),
      }),
      col.accessor('name', {
        header: 'Nome',
        cell: ({ row }) => (
          <EditableText
            value={row.original.name}
            className={row.original.status === 'consumed' ? 'line-through opacity-60' : ''}
            onCommit={(name) => name.trim() && updateProduct(row.original, { name }, index)}
          />
        ),
      }),
      col.accessor('quantity', {
        header: 'Qtà',
        cell: ({ row }) => (
          <EditableText
            type="number"
            className="w-16"
            value={String(row.original.quantity)}
            onCommit={(v) => {
              const n = parseInt(v, 10)
              if (n >= 1) void updateProduct(row.original, { quantity: n }, index)
            }}
          />
        ),
      }),
      col.accessor('expiryDate', {
        header: 'Scadenza',
        sortingFn: (a, b) => (a.original.expiryDate ?? '9999').localeCompare(b.original.expiryDate ?? '9999'),
        cell: ({ row }) => (
          <EditableText
            type="date"
            className="w-36"
            value={row.original.expiryDate ?? ''}
            onCommit={(v) => updateProduct(row.original, { expiryDate: isValidIsoDate(v) ? v : null }, index)}
          />
        ),
      }),
      col.display({
        id: 'days',
        header: 'Giorni',
        cell: ({ row }) => (row.original.status === 'consumed' ? <span className="text-xs text-slate-400">consumato</span> : <ExpiryBadge date={row.original.expiryDate} />),
      }),
      col.accessor('createdAt', { header: 'Inserito', cell: ({ getValue }) => <span className="text-xs whitespace-nowrap text-slate-500">{formatDateTime(getValue())}</span> }),
      col.accessor('consumedAt', {
        header: 'Consumato',
        cell: ({ getValue }) => <span className="text-xs whitespace-nowrap text-slate-500">{formatDateTime(getValue())}</span>,
      }),
    ],
    [index],
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection: selection, columnVisibility: { consumedAt: showConsumed } },
    getRowId: (p) => p.id,
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const selected = table.getSelectedRowModel().rows.map((r) => r.original)
  const selectedActive = selected.filter((p) => p.status === 'active')
  const selectedConsumed = selected.filter((p) => p.status === 'consumed')
  const clear = () => setSelection({})

  const expired = active.data.filter((p) => p.expiryDate && daysUntil(p.expiryDate, today) < 0).length
  const counts = TIPS.map((t) => ({ t, n: active.data.filter((p) => p.tip === t).length }))
  const uncategorized = active.data.filter((p) => !p.tip).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="card px-3 py-1.5">
          <strong>{active.data.length}</strong> in dispensa
        </span>
        <span className="card px-3 py-1.5 text-red-700 dark:text-red-300">
          <strong>{expired}</strong> scaduti
        </span>
        {counts.map(({ t, n }) => (
          <span key={t} className="card px-3 py-1.5">
            {TIP_ICONS[t]} {n}
          </span>
        ))}
        {uncategorized > 0 && <span className="card px-3 py-1.5 text-amber-700">❔ {uncategorized} da categorizzare</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-64" placeholder="Cerca…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input w-auto" value={tipFilter} onChange={(e) => setTipFilter(e.target.value as TipFilter)}>
          <option value="all">Tutti i tipi</option>
          {TIPS.map((t) => (
            <option key={t} value={t}>
              {TIP_ICONS[t]} {TIP_LABELS[t]}
            </option>
          ))}
          <option value="none">❔ Da categorizzare</option>
        </select>
        <select className="input w-auto" value={expiryFilter} onChange={(e) => setExpiryFilter(e.target.value as ExpiryFilter)}>
          <option value="all">Tutte le scadenze</option>
          <option value="expired">Scaduti</option>
          <option value="soon">Entro 7 giorni</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showConsumed} onChange={(e) => (setShowConsumed(e.target.checked), clear())} />
          Mostra anche i consumati (storico)
        </label>
      </div>

      {selected.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 bg-brand-50 px-3 py-2 dark:bg-slate-900">
          <span className="text-sm">{selected.length} selezionati</span>
          {selectedActive.length > 0 && (
            <button className="btn-primary py-1" onClick={() => run(`${selectedActive.length} segnati come consumati`, () => consumeProducts(selectedActive, null, user)).then(clear)}>
              ✓ Segna consumati
            </button>
          )}
          {selectedConsumed.length > 0 && (
            <button className="btn-secondary py-1" onClick={() => run(`${selectedConsumed.length} ripristinati`, () => restoreProducts(selectedConsumed)).then(clear)}>
              Ripristina
            </button>
          )}
          <TipSelect
            className="w-auto"
            value={null}
            onChange={(tip) => tip && run('Tipo aggiornato', () => updateProducts(selected, { tip }, index)).then(clear)}
          />
          <button
            className="btn-danger ml-auto py-1"
            onClick={() =>
              confirm(`Eliminare definitivamente ${selected.length} prodotti? Usalo solo per inserimenti sbagliati: per i prodotti finiti usa "Segna consumati".`) &&
              run(`${selected.length} eliminati`, () => deleteProducts(selected)).then(clear)
            }
          >
            Elimina
          </button>
        </div>
      )}

      {source.error && <ErrorBox>{source.error}</ErrorBox>}
      {source.loading ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase dark:bg-slate-900">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      className={`px-2 py-2 font-semibold ${h.column.getCanSort() ? 'cursor-pointer select-none' : ''}`}
                      onClick={h.column.getToggleSortingHandler()}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {{ asc: ' ▲', desc: ' ▼' }[h.column.getIsSorted() as string] ?? ''}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={row.getIsSelected() ? 'bg-brand-50 dark:bg-slate-800' : ''}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-2 py-1">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!data.length && <p className="p-6 text-center text-sm text-slate-500">Nessun prodotto.</p>}
        </div>
      )}
    </div>
  )
}
