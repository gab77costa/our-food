import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { signOut, useUser } from '../auth'

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`

export function Layout({ children }: { children: ReactNode }) {
  const user = useUser()
  const online = useOnline()
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          <span className="mr-2 hidden font-bold sm:inline">OurFoodHub</span>
          <nav className="flex gap-1">
            <NavLink to="/registra" className={navClass}>
              Registra
            </NavLink>
            <NavLink to="/gestione" className={navClass}>
              Gestione
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {!online && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">offline</span>}
            <button className="text-xs text-slate-500 hover:underline" onClick={() => signOut()} title={user.email ?? ''}>
              Esci
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">{children}</main>
    </div>
  )
}
