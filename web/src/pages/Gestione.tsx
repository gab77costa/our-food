import { NavLink, useParams } from 'react-router-dom'
import { HintsTable } from '../components/gestione/HintsTable'
import { ProductsTable } from '../components/gestione/ProductsTable'
import { SessionsList } from '../components/gestione/SessionsList'
import { Toast, useToast } from '../components/ui'

const TABS = [
  { id: 'prodotti', label: 'Prodotti' },
  { id: 'spese', label: 'Spese ed Excel' },
  { id: 'nomi', label: 'Nomi appresi' },
] as const

export function Gestione() {
  const { tab = 'prodotti' } = useParams()
  const { toast, show } = useToast()
  return (
    <div className="space-y-4">
      <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <NavLink
            key={t.id}
            to={`/gestione/${t.id}`}
            className={() =>
              `-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                tab === t.id ? 'border-brand-600 text-brand-700 dark:text-brand-500' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      {tab === 'spese' ? <SessionsList onToast={show} /> : tab === 'nomi' ? <HintsTable onToast={show} /> : <ProductsTable onToast={show} />}
      <Toast toast={toast} onClose={() => show(null)} />
    </div>
  )
}
