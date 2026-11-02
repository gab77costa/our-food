import type { Product } from '@ourfoodhub/core'
import type { ReactNode } from 'react'
import { ExpiryBadge, TipIcon } from '../ui'

export function ProductLine({ product: p, actions }: { product: Product; actions?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <TipIcon tip={p.tip} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">
          {p.name}
          {p.quantity > 1 && <span className="ml-1 text-slate-500">×{p.quantity}</span>}
        </div>
      </div>
      <ExpiryBadge date={p.expiryDate} />
      {actions}
    </div>
  )
}
