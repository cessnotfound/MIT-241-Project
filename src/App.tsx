
import './styles/ApplicationRenewal.css'

import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'

import LoginPage from './pages/auth/LoginPage'
import OsasLayout from './pages/osas/OsasLayout'
import OsasOverviewPage from './pages/osas/OsasOverviewPage'
import OsasOrganizationsPage from './pages/osas/OsasOrganizationsPage'
import OsasRenewalsPage from './pages/osas/OsasRenewalsPage'
import OsasAccomplishmentsPage from './pages/osas/OsasAccomplishmentsPage'
import OsasFinancialStatementsPage from './pages/osas/OsasFinancialStatementsPage'
import OrganizationLayout from './layouts/OrganizationLayout'
import DashboardPage from './pages/organization/DashboardPage'
import OrganizationProfilePage from './pages/organization/OrganizationProfilePage'
import OrganizationalStructurePage from './pages/organization/OrganizationalStructurePage'
import ApplicationRenewalPage from './pages/organization/ApplicationRenewalPage'
import AccomplishmentReportsPage from './pages/organization/AccomplishmentReportsPage'
import FinancialStatementsPage from './pages/organization/FinancialStatementsPage'
import DocumentManagementPage from './pages/organization/DocumentManagementPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/osas" element={<OsasLayout />}>
          <Route index element={<OsasOverviewPage />} />
          <Route path="organizations" element={<OsasOrganizationsPage />} />
          <Route path="renewals" element={<OsasRenewalsPage />} />
          <Route path="accomplishments" element={<OsasAccomplishmentsPage />} />
          <Route path="financial-statements" element={<OsasFinancialStatementsPage />} />
        </Route>

        <Route path="/organization" element={<OrganizationLayout />}>
          <Route
            index
            element={<Navigate to="dashboard" replace />}
          />
          <Route
            path="dashboard"
            element={<DashboardPage />}
          />
          <Route
            path="profile"
            element={<OrganizationProfilePage />}
          />
          <Route
            path="structure"
            element={<OrganizationalStructurePage />}
          />
          <Route path="accomplishments" element={<AccomplishmentReportsPage />} />
          <Route path="financial" element={<FinancialStatementsPage />} />
          <Route path="documents" element={<DocumentManagementPage />} />
          <Route
            path="renewal"
            element={<ApplicationRenewalPage />}
          />
        </Route>

        <Route
          path="*"
          element={<Navigate to="/login" replace />}
        />
      </Routes>
    </BrowserRouter>
  )
}
