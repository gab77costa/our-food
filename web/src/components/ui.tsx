import {
  daysUntil,
  expiryStatus,
  isLongShelfLife,
  localToday,
  TIP_ICONS,
  TIP_LABELS,
  TIP_SHORT,
  TIPS,
  type IsoDate,
  type Tip,
} from '@ourfoodhub/core'
import { useEffect, useState, type ReactNode } from 'react'

export function formatDate(iso: IsoDate | null): string {
  if (!iso) return ''
  return new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(ms: number | null): string {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** One color per tip, so the types are told apart by color as well as by icon. */
export const TIP_STYLE: Record<Tip, { soft: string; solid: string }> = {
  v: { soft: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100', solid: 'bg-emerald-600 text-white border-emerald-600' },
  f: { soft: 'bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100', solid: 'bg-sky-600 text-white border-sky-600' },
  c: { soft: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-100', solid: 'bg-indigo-600 text-white border-indigo-600' },
  d: { soft: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100', solid: 'bg-amber-600 text-white border-amber-600' },
  b: { soft: 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100', solid: 'bg-rose-600 text-white border-rose-600' },
}

/** The tip icon on a colored round background. */
export function TipIcon({ tip, size = 'md' }: { tip: Tip | null; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-9 w-9 text-xl' : 'h-7 w-7 text-base'
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${box} ${tip ? TIP_STYLE[tip].soft : 'bg-slate-200 dark:bg-slate-700'}`}
      title={tip ? TIP_LABELS[tip] : 'Da categorizzare'}
      aria-label={tip ? TIP_LABELS[tip] : 'Da categorizzare'}
    >
      {tip ? TIP_ICONS[tip] : '❔'}
    </span>
  )
}

export function TipBadge({ tip }: { tip: Tip | null }) {
  if (!tip) {
    return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">❔ da categorizzare</span>
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TIP_STYLE[tip].soft}`} title={TIP_LABELS[tip]}>
      {TIP_ICONS[tip]} {TIP_LABELS[tip]}
    </span>
  )
}

/** Five big buttons, easy to hit on a phone. */
export function TipPicker({ value, onChange, compact = false }: { value: Tip | null; onChange: (t: Tip) => void; compact?: boolean }) {
  return (
    <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Tipo">
      {TIPS.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          aria-label={TIP_LABELS[t]}
          onClick={() => onChange(t)}
          className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1 py-1.5 transition ${
            value === t
              ? `${TIP_STYLE[t].solid} shadow-md`
              : `border-transparent ${TIP_STYLE[t].soft} ${value ? 'opacity-50' : ''}`
          }`}
        >
          <span className="text-2xl leading-none" aria-hidden>
            {TIP_ICONS[t]}
          </span>
          <span className="text-center text-[11px] leading-tight font-medium">{compact ? TIP_SHORT[t] : TIP_LABELS[t]}</span>
        </button>
      ))}
    </div>
  )
}

export function TipSelect({ value, onChange, className = '' }: { value: Tip | null; onChange: (t: Tip | null) => void; className?: string }) {
  return (
    <select className={`input py-1 ${className}`} value={value ?? ''} onChange={(e) => onChange((e.target.value || null) as Tip | null)}>
      <option value="">— da categorizzare</option>
      {TIPS.map((t) => (
        <option key={t} value={t}>
          {TIP_ICONS[t]} {TIP_LABELS[t]}
        </option>
      ))}
    </select>
  )
}

export function ExpiryBadge({ date }: { date: IsoDate | null }) {
  const today = localToday()
  if (!date) return <span className="text-xs text-slate-400">—</span>
  if (isLongShelfLife(date, today)) return <span className="text-xs text-slate-500">lunga conservazione</span>
  const s = expiryStatus(date, today)
  const d = daysUntil(date, today)
  const style =
    s === 'expired'
      ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
      : s === 'soon'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
        : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200'
  const label = d < 0 ? `scaduto da ${-d} g` : d === 0 ? 'scade oggi' : d === 1 ? 'domani' : `${d} g`
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${style}`}>{label}</span>
}

export function Spinner({ label = 'Caricamento…' }: { label?: string }) {
  return <div className="p-8 text-center text-sm text-slate-500">{label}</div>
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{children}</div>
}

// ── Toast ────────────────────────────────────────────────────────────────────

export interface ToastMessage {
  text: string
  kind?: 'ok' | 'error'
  action?: { label: string; run: () => void }
}

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.action ? 6000 : 3500)
    return () => clearTimeout(t)
  }, [toast])
  return { toast, show: setToast }
}

export function Toast({ toast, onClose }: { toast: ToastMessage | null; onClose: () => void }) {
  if (!toast) return null
  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" role="status">
      <div
        className={`flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-lg ${
          toast.kind === 'error' ? 'bg-red-700' : 'bg-slate-900 dark:bg-slate-700'
        }`}
      >
        <span>{toast.text}</span>
        {toast.action && (
          <button
            className="font-semibold text-brand-100 underline"
            onClick={() => {
              toast.action!.run()
              onClose()
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  )
}

/** Inline editor: commits on blur or Enter, Esc cancels. */
export function EditableText({
  value,
  onCommit,
  type = 'text',
  className = '',
  placeholder,
}: {
  value: string
  onCommit: (v: string) => void
  type?: 'text' | 'number' | 'date'
  className?: string
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    if (draft !== value) onCommit(draft)
  }
  return (
    <input
      className={`w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:outline-none dark:hover:border-slate-700 dark:focus:bg-slate-900 ${className}`}
      type={type}
      min={type === 'number' ? 1 : undefined}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setDraft(value)
      }}
    />
  )
}
