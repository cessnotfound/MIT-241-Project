import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { osasGet, type OsasUser } from './osasTypes'
import '../../styles/OrganizationHeader.css'
import '../../styles/OrganizationTopBar.css'
import '../../styles/OsasPages.css'

const links = [
  { label: 'Overview', path: '/osas', end: true },
  { label: 'Organizations', path: '/osas/organizations', end: false },
  { label: 'Renewal Applications', path: '/osas/renewals', end: false },
  { label: 'Accomplishment Reports', path: '/osas/accomplishments', end: false },
  { label: 'Financial Statements', path: '/osas/financial-statements', end: false },
]
type OsasProfile = OsasUser & { has_profile_photo?: boolean }
export default function OsasLayout() {
  const navigate = useNavigate()
  const [user, setUser] = useState<OsasProfile | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [photoVersion, setPhotoVersion] = useState(0)
  const [photoError, setPhotoError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    void osasGet<OsasProfile>('/api/osas/me', controller.signal)
      .then(data => { if (!controller.signal.aborted) setUser(data) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to verify OSAS session') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    function close(e: MouseEvent) { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false) }
    function escape(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [])
  useEffect(() => {
    function updated(e: Event) {
      const newName = (e as CustomEvent<{username:string}>).detail?.username
      if (newName) setUser(old => old ? {...old,username:newName} : old)
    }
    window.addEventListener('osas-username-updated',updated)
    return () => window.removeEventListener('osas-username-updated',updated)
  }, [])
  async function logout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      const response = await fetch('/api/logout', { method:'POST', credentials:'same-origin' })
      if (!response.ok) throw new Error('Unable to log out')
      navigate('/login', { replace:true })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to log out') }
    finally { setLoggingOut(false) }
  }
  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPhotoError('')
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 2*1024*1024) {
      setPhotoError('Use a JPG, PNG or WebP image no larger than 2 MB.')
      return
    }
    setUploading(true)
    try {
      const response = await fetch('/api/osas/photo', {method:'POST', credentials:'same-origin',headers:{'Content-Type':file.type},body:file})
      const data = await response.json() as { error?:string }
      if (!response.ok) throw new Error(data.error || 'Unable to upload OSAS photo')
      setUser(old => old ? {...old, has_profile_photo:true}:old)
      setPhotoVersion(v=>v+1)
    } catch(e) { setPhotoError(e instanceof Error ? e.message : 'Photo upload failed') }
    finally { setUploading(false) }
  }
  const hasPhoto = !!user?.has_profile_photo
  const avatar = hasPhoto
    ? <img src={`/api/osas/photo?v=${photoVersion}`} alt="OSAS profile" className="organization-sidebar-logo" />
    : <span className="organization-sidebar-logo-placeholder">OSAS</span>
  return <div className="organization-layout osas-layout">
    <div className="sas-portal-topbar"><div className="sas-portal-topbar-inner">
      <div className="sas-portal-topbar-spacer" aria-hidden="true" />
      <div className="sas-portal-account" ref={menuRef}>
        <button type="button" className="sas-portal-account-trigger" aria-label="OSAS account menu" aria-haspopup="true" aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)}>
          {hasPhoto ? <img src={`/api/osas/photo?v=${photoVersion}`} className="sas-portal-account-logo" alt="OSAS profile"/> : <span className="sas-portal-account-initials">OS</span>}
          <span className="sas-portal-account-name">{user?.username || 'OSAS'}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={menuOpen?'sas-portal-chevron is-open':'sas-portal-chevron'} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {menuOpen && <div className="sas-portal-menu"><button type="button" className="sas-portal-menu-logout" disabled={loggingOut} onClick={()=>void logout()}>{loggingOut?'Logging out...':'Logout'}</button></div>}
      </div>
    </div></div>
    <header className="organization-banner" aria-hidden="true"/>
    <div className="organization-banner-space" aria-hidden="true"/>
    <div className="organization-body-surface"><div className="organization-body">
      <div className="organization-scroll-identity"><h1>OSAS Administration</h1><p>@{user?.username || 'osas'}</p></div>
      <aside className="organization-sidebar">
        <div className="organization-sidebar-photo">
          <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void uploadPhoto(e)} disabled={loading || uploading} className="organization-photo-input" aria-label="Choose OSAS profile photo" />
          <button type="button" className="organization-photo-button" disabled={loading || uploading} title="Change OSAS profile photo" aria-label="Change OSAS profile photo" onClick={()=>photoRef.current?.click()}>
            {avatar}
            <span className="organization-photo-overlay" aria-hidden="true"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 4h-4l-2 3H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2-3Z"/><circle cx="12" cy="13" r="3.5"/></svg><span>{uploading?'Uploading...':'Change Photo'}</span></span>
            <span className="organization-photo-camera" aria-hidden="true"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 4h-4l-2 3H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2-3Z"/><circle cx="12" cy="13" r="3.5"/></svg></span>
          </button>
          {photoError && <p className="organization-photo-error" role="alert">{photoError}</p>}
        </div>
        <nav className="organization-sidebar-nav" aria-label="OSAS navigation">{links.map(link=><NavLink key={link.path} end={link.end} to={link.path} className={({isActive})=>isActive?'sidebar-link active':'sidebar-link'}>{link.label}</NavLink>)}</nav>
      </aside>
      <main className="organization-content">{loading?<p>Checking OSAS session...</p>:error?<p className="osas-error" role="alert">{error}</p>:user?<Outlet/>:null}</main>
    </div></div>
  </div>
}
