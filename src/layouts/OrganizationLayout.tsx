import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import {
  NavLink,
  Outlet,
  useNavigate,
} from 'react-router-dom'
import '../styles/OrganizationHeader.css'
import '../styles/OrganizationTopBar.css'

type Organization = {
  organization_name: string
  username: string
  profile_photo_path: string | null
}

const NAVIGATION = [
  { label: 'Overview', path: '/organization/dashboard' },
  { label: 'Organization Profile', path: '/organization/profile' },
  { label: 'Organizational Structure', path: '/organization/structure' },
  { label: 'Application for Renewal', path: '/organization/renewal' },
]

export default function OrganizationLayout() {
  const navigate = useNavigate()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [photoVersion, setPhotoVersion] = useState(0)
  const [photoError, setPhotoError] = useState('')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function loadOrganization() {
      try {
        const response = await fetch('/api/me', {
          credentials: 'same-origin',
          signal: controller.signal,
        })

        if (response.status === 401) {
          navigate('/login', { replace: true })
          return
        }
        if (!response.ok) throw new Error('Unable to load organization.')

        const data: Organization = await response.json()
        if (!controller.signal.aborted) setOrganization(data)
      } catch (error) {
        if (!controller.signal.aborted) {
          setPhotoError(
            error instanceof Error ? error.message : 'Unable to load organization.'
          )
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadOrganization()
    return () => controller.abort()
  }, [navigate])

  useEffect(() => {
    function closeWhenClickedOutside(event: MouseEvent) {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setAccountMenuOpen(false)
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setAccountMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeWhenClickedOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeWhenClickedOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setPhotoError('')
    const allowed = ['image/jpeg', 'image/png', 'image/webp']

    if (!allowed.includes(file.type)) {
      setPhotoError('Choose a JPG, PNG, or WebP image.')
      event.target.value = ''
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Profile photo must be 2 MB or smaller.')
      event.target.value = ''
      return
    }

    setUploading(true)
    try {
      const response = await fetch('/api/organization/photo', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': file.type },
        body: file,
      })

      if (response.status === 401) {
        navigate('/login', { replace: true })
        return
      }
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Photo upload failed.')

      setOrganization(previous => previous
        ? { ...previous, profile_photo_path: 'uploaded' }
        : previous
      )
      setPhotoVersion(version => version + 1)
      window.dispatchEvent(new Event('organization-photo-updated'))
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Photo upload failed.')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      const response = await fetch('/api/logout', {
        method: 'POST',
        credentials: 'same-origin',
      })
      if (!response.ok) throw new Error('Logout failed.')
      setAccountMenuOpen(false)
      navigate('/login', { replace: true })
    } catch {
      alert('Unable to log out. Please try again.')
    } finally {
      setLoggingOut(false)
    }
  }

  const initials = organization?.organization_name
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase() || 'ORG'

  return (
    <div className="organization-layout">
      {/* Fixed top bar: overlay only, so the 440px banner DOES NOT MOVE. */}
      <div className="sas-portal-topbar">
        <div className="sas-portal-topbar-inner">
          <div className="sas-portal-topbar-spacer" aria-hidden="true" />
          <div className="sas-portal-account" ref={accountMenuRef}>
            <button
              type="button"
              className="sas-portal-account-trigger"
              aria-haspopup="true"
              aria-expanded={accountMenuOpen}
              aria-label="Organization account menu"
              onClick={() => setAccountMenuOpen(open => !open)}
            >
              {organization?.profile_photo_path ? (
                <img
                  src={`/api/organization/photo?v=${photoVersion}`}
                  alt="Organization logo"
                  className="sas-portal-account-logo"
                />
              ) : (
                <span className="sas-portal-account-initials">{initials}</span>
              )}
              <span className="sas-portal-account-name">
                {organization?.username || 'organization'}
              </span>
              <svg
                width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                className={accountMenuOpen ? 'sas-portal-chevron is-open' : 'sas-portal-chevron'}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {accountMenuOpen && (
              <div className="sas-portal-menu">
                <button
                  type="button"
                  className="sas-portal-menu-logout"
                  disabled={loggingOut}
                  onClick={() => void handleLogout()}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="m16 17 5-5-5-5" />
                    <path d="M21 12H9" />
                  </svg>
                  {loggingOut ? 'Logging out...' : 'Logout'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Original campus banner and scroll-cover wrappers: unchanged. */}
      <header className="organization-banner" aria-hidden="true" />
      <div className="organization-banner-space" aria-hidden="true" />

      <div className="organization-body-surface">
        <div className="organization-body">
          <div className="organization-scroll-identity">
            <h1>{organization?.organization_name || 'Student Organization'}</h1>
            <p>@{organization?.username || 'organization'}</p>
          </div>

          <aside className="organization-sidebar">
            <div className="organization-sidebar-photo">
              <input
                ref={photoInputRef}
                id="organization-logo-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => void uploadPhoto(event)}
                disabled={uploading || loading}
                className="organization-photo-input"
                aria-label="Choose organization profile photo"
              />

              <button
                type="button"
                className="organization-photo-button"
                aria-label={uploading ? 'Uploading organization photo' : 'Change organization profile photo'}
                title="Change organization profile photo"
                disabled={uploading || loading}
                onClick={() => photoInputRef.current?.click()}
              >
                {organization?.profile_photo_path ? (
                  <img
                    src={`/api/organization/photo?v=${photoVersion}`}
                    className="organization-sidebar-logo"
                    alt={`${organization.organization_name} logo`}
                  />
                ) : (
                  <span className="organization-sidebar-logo-placeholder">{initials}</span>
                )}

                <span className="organization-photo-overlay" aria-hidden="true">
                  <svg width="25" height="25" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 4h-4l-2 3H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2-3Z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                  <span>{uploading ? 'Uploading...' : 'Change Photo'}</span>
                </span>

                <span className="organization-photo-camera" aria-hidden="true">
                  <svg width="19" height="19" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 4h-4l-2 3H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2-3Z" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                </span>
              </button>

              {photoError && (
                <p className="organization-photo-error" role="alert">{photoError}</p>
              )}
            </div>

            <nav className="organization-sidebar-nav" aria-label="Organization navigation">
              {NAVIGATION.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}
                >
                  {item.label}
                </NavLink>
              ))}

              <div className="sidebar-section">
                <NavLink
                  to="/organization/accomplishments"
                  className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}
                >
                  Accomplishment Reports
                </NavLink>
                <NavLink
                  to="/organization/financial"
                  className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}
                >
                  Financial Statements
                </NavLink>
                <NavLink to="/organization/documents" className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}>Document Management</NavLink>
              </div>
            </nav>
            {/* Logout moved to the top-right menu. */}
          </aside>

          <main className="organization-content">
            {loading ? (
              <p>Loading Student Organization Portal...</p>
            ) : (
              <Outlet />
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
