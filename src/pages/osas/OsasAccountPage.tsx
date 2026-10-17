import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type OsasUser = { username: string; full_name: string; role: 'OSAS' }

// Step 1 only: account verification landing page. Overview comes next.
export default function OsasAccountPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<OsasUser | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/osas/me', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) { navigate('/login', { replace: true }); return null }
        if (!response.ok) throw new Error('Unable to load OSAS account')
        return response.json() as Promise<OsasUser>
      })
      .then((data) => { if (data && !controller.signal.aborted) setUser(data) })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load account')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [navigate])

  async function logout() {
    try {
      const response = await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
      if (!response.ok) throw new Error('Logout failed')
      navigate('/login', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Logout failed')
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: '70px auto', padding: 24, fontFamily: 'inherit' }}>
      <h1>OSAS Account</h1>
      {loading ? <p>Checking administrator session...</p> : null}
      {user ? <>
        <p>Signed in as <strong>{user.full_name}</strong> ({user.username}).</p>
        <p>The OSAS account and database connection are ready. The OSAS Overview will be built in the next phase.</p>
        <button type="button" onClick={logout}>Log out</button>
      </> : null}
      {error ? <p role="alert">{error}</p> : null}
    </main>
  )
}
