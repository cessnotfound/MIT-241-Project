import '../../styles/OrganizationalStructureNavigation.css'
import '../../styles/FeedbackNotification.css'
import FeedbackNotification from '../../components/FeedbackNotification'
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'

type Person = {
  id: string
  full_name: string
  academic_year: string
  department?: string | null
  position?: string | null
}

type StructureResponse = {
  academic_year: string
  advisers: Person[]
  officers: Person[]
}

type RecordKind = 'advisers' | 'officers'


export default function OrganizationalStructurePage() {
  const navigate = useNavigate()

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [currentTerm, setCurrentTerm] = useState('')
  const [advisers, setAdvisers] = useState<Person[]>([])
  const [officers, setOfficers] = useState<Person[]>([])

  const [showAdviserForm, setShowAdviserForm] = useState(false)
  const [showOfficerForm, setShowOfficerForm] = useState(false)

  const [adviserName, setAdviserName] = useState('')
  const [department, setDepartment] = useState('')
  const [editingAdviserId, setEditingAdviserId] =
    useState<string | null>(null)

  const [officerName, setOfficerName] = useState('')
  const [position, setPosition] = useState('')
  const [editingOfficerId, setEditingOfficerId] =
    useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Same dismissible feedback behavior as Organization Profile.
  useEffect(() => {
    if (!error && !message) return
    const timer = window.setTimeout(() => {
      setError('')
      setMessage('')
    }, 5500)
    return () => window.clearTimeout(timer)
  }, [error, message])

  const loadStructure = useCallback(
    async (signal?: AbortSignal): Promise<boolean> => {
      const response = await fetch('/api/structure', {
        credentials: 'same-origin',
        signal,
      })

      if (response.status === 401) {
        navigate('/login', { replace: true })
        return false
      }

      const data: StructureResponse & { error?: string } =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Unable to load organizational structure.'
        )
      }

      if (!data.academic_year) {
        throw new Error('Academic year is unavailable.')
      }

      if (signal?.aborted) return false

      setCurrentTerm(data.academic_year)
      setAdvisers(data.advisers)
      setOfficers(data.officers)

      return true
    },
    [navigate]
  )

  useEffect(() => {
    const controller = new AbortController()

    async function initialize() {
      try {
        await loadStructure(controller.signal)
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : 'Loading failed.'
          )
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void initialize()

    return () => controller.abort()
  }, [loadStructure])

  function closeAdviserForm() {
    setShowAdviserForm(false)
    setEditingAdviserId(null)
    setAdviserName('')
    setDepartment('')
  }

  function closeOfficerForm() {
    setShowOfficerForm(false)
    setEditingOfficerId(null)
    setOfficerName('')
    setPosition('')
  }

  function openAddAdviser() {
    closeAdviserForm()
    setShowAdviserForm(true)
    setError('')
    setMessage('')
  }

  function openAddOfficer() {
    closeOfficerForm()
    setShowOfficerForm(true)
    setError('')
    setMessage('')
  }

  function editAdviser(adviser: Person) {
    setEditingAdviserId(adviser.id)
    setAdviserName(adviser.full_name)
    setDepartment(adviser.department ?? '')
    setShowAdviserForm(true)
    setError('')
    setMessage('')
  }

  function editOfficer(officer: Person) {
    setEditingOfficerId(officer.id)
    setOfficerName(officer.full_name)
    setPosition(officer.position ?? '')
    setShowOfficerForm(true)
    setError('')
    setMessage('')
  }

  async function apiRequest(
    url: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body?: Record<string, string>
  ) {
    const response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body
        ? { 'Content-Type': 'application/json' }
        : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (response.status === 401) {
      navigate('/login', { replace: true })
      throw new Error('Your session has expired.')
    }

    const data: { error?: string } = await response.json()

    if (!response.ok) {
      throw new Error(
        data.error || `Request failed (${response.status}).`
      )
    }
  }

  async function refreshRecords() {
    try {
      return await loadStructure()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to refresh records.'
      )
      return false
    }
  }

  async function saveRecord(
    kind: RecordKind,
    id: string | null,
    fullName: string,
    extra: string
  ) {
    if (busy) return

    setBusy(true)
    setError('')
    setMessage('')

    try {
      const endpoint = id
        ? `/api/structure/${kind}/${id}`
        : `/api/structure/${kind}`

      await apiRequest(endpoint, id ? 'PUT' : 'POST', {
        full_name: fullName.trim(),
        [kind === 'advisers' ? 'department' : 'position']:
          extra.trim(),
      })

      if (kind === 'advisers') {
        closeAdviserForm()
      } else {
        closeOfficerForm()
      }

      const refreshed = await refreshRecords()

      if (refreshed) {
        const label = kind === 'advisers' ? 'Adviser' : 'Officer'
        setMessage(
          `${label} ${id ? 'updated' : 'added'} successfully.`
        )
      } else {
        setMessage('Record saved. Please refresh the list.')
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to save record.'
      )
    } finally {
      setBusy(false)
    }
  }

  function handleAdviserSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void saveRecord(
      'advisers',
      editingAdviserId,
      adviserName,
      department
    )
  }

  function handleOfficerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void saveRecord(
      'officers',
      editingOfficerId,
      officerName,
      position
    )
  }

  async function removeRecord(kind: RecordKind, id: string) {
    if (busy) return

    const label = kind === 'advisers' ? 'adviser' : 'officer'

    if (!window.confirm(`Remove this ${label}?`)) return

    setBusy(true)
    setError('')
    setMessage('')

    try {
      await apiRequest(`/api/structure/${kind}/${id}`, 'DELETE')

      if (kind === 'advisers') {
        setAdvisers((items) =>
          items.filter((item) => item.id !== id)
        )
        if (editingAdviserId === id) closeAdviserForm()
      } else {
        setOfficers((items) =>
          items.filter((item) => item.id !== id)
        )
        if (editingOfficerId === id) closeOfficerForm()
      }

      const refreshed = await refreshRecords()

      setMessage(
        refreshed
          ? 'Record removed successfully.'
          : 'Record removed. Please refresh the list.'
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to remove record.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="structure-page">
      {/* SIMPLE PAGE HEADING */}
      <header className="structure-page-header">
        <h1>Organizational Structure</h1>
        <p>Academic Year {currentTerm ? currentTerm.replace('-', '–') : '—'}</p>
      </header>

      <FeedbackNotification
        error={error}
        message={message}
        onDismiss={() => { setError(''); setMessage('') }}
      />

      {!detailsOpen ? (
        <button type="button" className="structure-election-card" onClick={() => {
          setDetailsOpen(true)
          setError('')
          setMessage('')
        }}>
          <span className="structure-election-card-copy">
            <strong>List of Elected Officers</strong>
            <small>Academic Year {currentTerm ? currentTerm.replace('-', '–') : '—'}</small>
          </span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      ) : (
      <div className="structure-details-view">
        <div className="structure-details-toolbar">
          <button type="button" className="structure-back-icon" title="Back to Organizational Structure" aria-label="Back to Organizational Structure" onClick={() => {
            closeAdviserForm()
            closeOfficerForm()
            setDetailsOpen(false)
            setError('')
            setMessage('')
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/><path d="M9 12h12"/></svg>
          </button>
          <div>
            <h2>List of Elected Officers</h2>
            <p>Academic Year {currentTerm ? currentTerm.replace('-', '–') : '—'}</p>
          </div>
        </div>
      {/* ORGANIZATION ADVISER */}
      <section className="structure-panel">
        <div className="structure-panel-heading">
          <h2>Organization Adviser</h2>

          {!showAdviserForm && (
            <button
              type="button"
              onClick={openAddAdviser}
              disabled={busy}
            >
              + Add Adviser
            </button>
          )}
        </div>

        {showAdviserForm && (
          <form
            className="structure-entry-form"
            onSubmit={handleAdviserSubmit}
          >
            <h3>
              {editingAdviserId ? 'Edit Adviser' : 'Add Adviser'}
            </h3>

            <div className="structure-form-grid">
              <label htmlFor="adviser-fullname">
                Adviser Fullname
                <input
                  id="adviser-fullname"
                  type="text"
                  value={adviserName}
                  onChange={(event) =>
                    setAdviserName(event.target.value)
                  }
                  placeholder="Enter adviser full name"
                  maxLength={150}
                  disabled={busy}
                  required
                />
              </label>

              <label htmlFor="adviser-department">
                Department
                <input
                  id="adviser-department"
                  type="text"
                  value={department}
                  onChange={(event) =>
                    setDepartment(event.target.value)
                  }
                  placeholder="Enter department"
                  maxLength={150}
                  disabled={busy}
                />
              </label>
            </div>

            <div className="structure-actions">
              <button type="submit" className="structure-icon-submit" title={editingAdviserId ? 'Save adviser changes' : 'Save adviser'} disabled={busy || !adviserName.trim()}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
                <span className="structure-visually-hidden">{busy ? 'Saving adviser' : editingAdviserId ? 'Save adviser changes' : 'Save adviser'}</span>
              </button>

              <button
                type="button"
                className="structure-icon-cancel"
                aria-label="Cancel adviser form"
                title="Cancel"
                onClick={closeAdviserForm}
                disabled={busy}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="structure-empty">Loading advisers...</p>
        ) : advisers.length === 0 ? (
          <p className="structure-empty">
            No adviser added yet.
          </p>
        ) : (
          <div className="structure-table-wrapper">
            <table className="structure-table">
              <thead>
                <tr>
                  <th>Adviser Fullname</th>
                  <th>Department</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {advisers.map((adviser) => (
                  <tr key={adviser.id}>
                    <td>{adviser.full_name}</td>
                    <td>{adviser.department || '—'}</td>
                    <td>
                      <div className="structure-row-actions">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => editAdviser(adviser)}
                          className="structure-icon-edit"
                          aria-label={`Edit ${adviser.full_name}`}
                          title="Edit"
                        >
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>
                        </button>

                        <button
                          type="button"
                          className="structure-remove-button"
                          disabled={busy}
                          onClick={() =>
                            void removeRecord('advisers', adviser.id)
                          }
                          aria-label={`Remove ${adviser.full_name}`}
                          title="Remove"
                        >
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ORGANIZATION OFFICERS */}
      <section className="structure-panel">
        <div className="structure-panel-heading">
          <h2>Organization Officers</h2>

          {!showOfficerForm && (
            <button
              type="button"
              onClick={openAddOfficer}
              disabled={busy}
            >
              + Add Officer
            </button>
          )}
        </div>

        {showOfficerForm && (
          <form
            className="structure-entry-form"
            onSubmit={handleOfficerSubmit}
          >
            <h3>
              {editingOfficerId ? 'Edit Officer' : 'Add Officer'}
            </h3>

            <div className="structure-form-grid">
              <label htmlFor="officer-name">
                Name
                <input
                  id="officer-name"
                  type="text"
                  value={officerName}
                  onChange={(event) =>
                    setOfficerName(event.target.value)
                  }
                  placeholder="Enter officer full name"
                  maxLength={150}
                  disabled={busy}
                  required
                />
              </label>

              <label htmlFor="officer-position">
                Position
                <input
                  id="officer-position"
                  type="text"
                  value={position}
                  onChange={(event) =>
                    setPosition(event.target.value)
                  }
                  placeholder="Enter position"
                  maxLength={100}
                  disabled={busy}
                  required
                />
              </label>
            </div>

            <div className="structure-actions">
              <button
                type="submit"
                className="structure-icon-submit"
                disabled={busy || !officerName.trim() || !position.trim()}
                aria-label={editingOfficerId ? 'Save officer changes' : 'Save officer'}
                title={editingOfficerId ? 'Save changes' : 'Save officer'}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
              </button>
              <button
                type="button"
                className="structure-icon-cancel"
                disabled={busy}
                onClick={closeOfficerForm}
                aria-label="Cancel officer form"
                title="Cancel"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="structure-empty">Loading officers...</p>
        ) : officers.length === 0 ? (
          <p className="structure-empty">
            No officers added yet.
          </p>
        ) : (
          <div className="structure-table-wrapper">
            <table className="structure-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Position</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {officers.map((officer) => (
                  <tr key={officer.id}>
                    <td>{officer.full_name}</td>
                    <td>{officer.position}</td>
                    <td>
                      <div className="structure-row-actions">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => editOfficer(officer)}
                          className="structure-icon-edit"
                          aria-label={`Edit ${officer.full_name}`}
                          title="Edit"
                        >
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>
                        </button>

                        <button
                          type="button"
                          className="structure-remove-button"
                          disabled={busy}
                          onClick={() =>
                            void removeRecord('officers', officer.id)
                          }
                          aria-label={`Remove ${officer.full_name}`}
                          title="Remove"
                        >
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>
      )}
    </div>
  )
}
