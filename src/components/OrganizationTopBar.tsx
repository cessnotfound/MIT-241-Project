
import { useEffect, useRef, useState } from 'react'
import '../styles/OrganizationTopBar.css'

type OrganizationTopBarProps = {
  username?: string | null
  photoVersion?: number
  hasPhoto?: boolean
  onLogout: () => void | Promise<void>
}

export default function OrganizationTopBar({
  username,
  photoVersion = 0,
  hasPhoto = false,
  onLogout,
}: OrganizationTopBarProps) {
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const handleLogout = async () => {
    if (loggingOut) return

    setLoggingOut(true)

    try {
      await onLogout()
      setOpen(false)
    } finally {
      setLoggingOut(false)
    }
  }

  const initials = (username || 'ORG')
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="sas-topbar">
      <div className="sas-topbar-inner">

        <div className="sas-topbar-spacer" />

        <div className="sas-topbar-title">
          STUDENT AFFAIRS AND SERVICES
        </div>

        <div className="sas-account" ref={menuRef}>
          <button
            type="button"
            className="sas-account-trigger"
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="Organization account menu"
            onClick={() => setOpen((previous) => !previous)}
          >
            {hasPhoto ? (
              <img
                className="sas-account-photo"
                src={`/api/organization/photo?v=${photoVersion}`}
                alt="Organization logo"
              />
            ) : (
              <span className="sas-account-placeholder">
                {initials}
              </span>
            )}

            <span className="sas-account-username">
              {username || 'organization'}
            </span>

            <svg
              className={`sas-account-chevron ${open ? 'open' : ''}`}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {open && (
            <div className="sas-account-dropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                className="sas-logout-option"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
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
    </header>
  )
}
