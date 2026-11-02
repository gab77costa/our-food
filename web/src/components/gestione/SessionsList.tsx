import type { Session } from '@ourfoodhub/core'
import { useState } from 'react'
import { fetchAllProducts, useSessions } from '../../data/hooks'
import { downloadSessionFile } from '../../lib/download'
import { ErrorBox, formatDate, Spinner, type ToastMessage } from '../ui'

export function SessionsList({ onToast }: { onToast: (t: ToastMessage) => void }) {
  const sessions = useSessions()
  const [busy, setBusy] = useState<string | null>(null)

  const download = async (s: Session) => {
    setBusy(s.id)
    try {
      await downloadSessionFile(s, await fetchAllProducts())
    } catch (e) {
      onToast({ text: `Impossibile creare il file: ${String(e)}`, kind: 'error' })
    } finally {
      setBusy(null)
    }
  }

  if (sessions.loading) return <Spinner />
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Ogni spesa ha il suo file Excel: la dispensa com’era alla chiusura, nello stesso formato dei file storici. Per una spesa ancora aperta il file mostra la dispensa di adesso.
      </p>
      {sessions.error && <ErrorBox>{sessions.error}</ErrorBox>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase dark:bg-slate-900">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Stato</th>
              <th className="px-3 py-2 text-right">Aggiunti</th>
              <th className="px-3 py-2 text-right">Consumati</th>
              <th className="px-3 py-2">Origine</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {sessions.data.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2 font-medium whitespace-nowrap">{formatDate(s.date)}</td>
                <td className="px-3 py-2">{s.status === 'open' ? <span className="text-brand-600">aperta</span> : 'chiusa'}</td>
                <td className="px-3 py-2 text-right">{s.addedCount}</td>
                <td className="px-3 py-2 text-right">{s.consumedCount}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{s.source === 'import' ? 'storico Excel' : 'app'}</td>
                <td className="px-3 py-2 text-right">
                  <button className="btn-secondary py-1" disabled={busy !== null} onClick={() => download(s)}>
                    {busy === s.id ? '…' : '⬇ Excel'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!sessions.data.length && <p className="p-6 text-center text-sm text-slate-500">Nessuna spesa registrata.</p>}
      </div>
    </div>
  )
}
