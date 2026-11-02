import { Navigate, Route, Routes } from 'react-router-dom'
import { signIn, signOut, useAuth } from './auth'
import { Layout } from './components/Layout'
import { ErrorBox, Spinner } from './components/ui'
import { Gestione } from './pages/Gestione'
import { Registra } from './pages/Registra'
import { useState } from 'react'

/** Phones start on registration, larger screens on management. */
function Home() {
  const isPhone = window.matchMedia('(max-width: 767px)').matches
  return <Navigate to={isPhone ? '/registra' : '/gestione'} replace />
}

export function App() {
  const auth = useAuth()
  if (auth.status === 'loading') return <Spinner />
  if (auth.status === 'signedOut') return <Login />
  if (auth.status === 'notAllowed') return <NotAllowed email={auth.user.email} />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/registra" element={<Registra />} />
        <Route path="/gestione/:tab?" element={<Gestione />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

function Login() {
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <img src="/icon.svg" alt="" className="h-20 w-20" />
      <div>
        <h1 className="text-2xl font-bold">OurFoodHub</h1>
        <p className="mt-1 text-sm text-slate-500">Le scadenze della dispensa di casa</p>
      </div>
      <button className="btn-primary px-6 py-3 text-base" onClick={() => signIn().catch((e) => setError(String(e?.message ?? e)))}>
        Accedi con Google
      </button>
      {error && <ErrorBox>{error}</ErrorBox>}
    </div>
  )
}

function NotAllowed({ email }: { email: string | null }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Accesso non autorizzato</h1>
      <p className="max-w-sm text-sm text-slate-600 dark:text-slate-300">
        L’account <strong>{email}</strong> non è tra quelli abilitati. Chiedi all’amministratore di aggiungerlo.
      </p>
      <button className="btn-secondary" onClick={() => signOut()}>
        Esci e usa un altro account
      </button>
    </div>
  )
}
