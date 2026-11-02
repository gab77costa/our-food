import { buildHintIndex, localToday, type CategoryHint, type Product, type Session } from '@ourfoodhub/core'
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../firebase'
import { toHint, toProduct, toSession } from './convert'

interface Live<T> {
  data: T
  loading: boolean
  error: string | null
}

/** Live results of a query (null = disabled). `q` must be memoized by the caller. */
function useLiveQuery<T>(q: Query | null, map: (s: QueryDocumentSnapshot<DocumentData>) => T): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: q !== null, error: null })
  useEffect(() => {
    if (!q) {
      setState({ data: [], loading: false, error: null })
      return
    }
    setState((s) => ({ ...s, loading: true }))
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map(map), loading: false, error: null }),
      (e) => setState((s) => ({ ...s, loading: false, error: e.message })),
    )
  }, [q, map])
  return state
}

/** Products currently in the pantry, in insertion order. */
export function useActiveProducts() {
  const q = useMemo(() => query(collection(db, 'products'), where('status', '==', 'active'), orderBy('seq')), [])
  return useLiveQuery<Product>(q, toProduct)
}

/** Every product, consumed ones included (history, session files). Loaded only when needed. */
export function useAllProducts(enabled: boolean) {
  const q = useMemo(() => (enabled ? query(collection(db, 'products'), orderBy('seq')) : null), [enabled])
  return useLiveQuery<Product>(q, toProduct)
}

export function useSessions() {
  const q = useMemo(() => query(collection(db, 'sessions'), orderBy('date', 'desc')), [])
  return useLiveQuery<Session>(q, toSession)
}

export function useHints() {
  const q = useMemo(() => query(collection(db, 'categoryHints')), [])
  const live = useLiveQuery<CategoryHint>(q, toHint)
  const index = useMemo(() => buildHintIndex(live.data), [live.data])
  return { ...live, index }
}

/** Products consumed during a session (to show and undo them). */
export function useSessionConsumed(sessionId: string) {
  const q = useMemo(() => query(collection(db, 'products'), where('consumedInSessionId', '==', sessionId)), [sessionId])
  return useLiveQuery<Product>(q, toProduct)
}

/** One-off read of every product, for building a session file. */
export async function fetchAllProducts(): Promise<Product[]> {
  const snap = await getDocs(query(collection(db, 'products'), orderBy('seq')))
  return snap.docs.map(toProduct)
}

/** Today's session (open or closed), if any. */
export function useTodaySession() {
  const today = localToday()
  const [state, setState] = useState<{ session: Session | null; loading: boolean }>({ session: null, loading: true })
  useEffect(
    () =>
      onSnapshot(doc(db, 'sessions', today), (snap) =>
        setState({ session: snap.exists() ? toSession(snap) : null, loading: false }),
      ),
    [today],
  )
  return { ...state, today }
}
