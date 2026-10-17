
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

type Organization = {
  organization_name: string
  username: string
  college: string | null
  description: string | null
  current_academic_year: string
  recognition_status: string | null
  office_order_number: string | null
}

export default function DashboardPage() {
  const navigate = useNavigate()

  const [organization, setOrganization] =
    useState<Organization | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

        if (!response.ok) {
          throw new Error(
            'Unable to load organization overview.'
          )
        }

        const data: Organization = await response.json()

        if (!controller.signal.aborted) {
          setOrganization(data)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load organization overview.'
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadOrganization()

    return () => controller.abort()
  }, [navigate])

  if (loading) {
    return <p>Loading organization overview...</p>
  }

  if (error) {
    return <p role="alert">{error}</p>
  }

  if (!organization) {
    return <p>Organization not found.</p>
  }

  return (
    <div className="dashboard-page">
      <h1>Organization Overview</h1>

      {/* ORGANIZATION INFORMATION */}
      <section className="organization-info-section">
        <h3>Organization Information</h3>

        <div className="dashboard-centered-info">
          <div className="dashboard-centered-info-row">
            <strong>Organization Name:</strong>{' '}
            <span>{organization.organization_name}</span>
          </div>

          <div className="dashboard-centered-info-row">
            <strong>College:</strong>{' '}
            <span>
              {organization.college || 'Not assigned'}
            </span>
          </div>

        <div className="dashboard-centered-info-row">
  <strong>Academic Year:</strong>{' '}
  <span>{organization.current_academic_year?.replace('-', '–') || 'Not assigned'}</span>
</div>
          <div className="dashboard-centered-info-row">
            <strong>Office Order Number:</strong>{' '}
            <span>{organization.office_order_number || 'Not assigned'}</span>
          </div>


          <div className="dashboard-centered-info-row">
            <strong>Status:</strong>{' '}
            <span>
              {organization.recognition_status || 'NOT RENEWED'}
            </span>
          </div>
        </div>
      </section>

      {/* ORGANIZATION DESCRIPTION */}
      <section className="organization-description-section">
        <h3>Organization Description</h3>

        <p>
          {organization.description ||
            'No organization description available.'}
        </p>

        <Link
          to="/organization/profile"
          className="dashboard-profile-link"
        >
          View Organization Profile
        </Link>
      </section>
    </div>
  )
}
