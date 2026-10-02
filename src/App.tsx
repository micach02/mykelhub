import type { ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { Splash } from './components/layout/BrandMark'
import { useAppliedTheme } from './components/layout/useAppliedTheme'
import { Toaster } from './components/ui/Toast'
import { useCloudSync } from './lib/cloudSync'
import { Dashboard } from './pages/Dashboard'
import { Credit } from './pages/Credit'
import { Parking } from './pages/Parking'
import { Inventory } from './pages/Inventory'
import { Sales } from './pages/Sales'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'
import { Login } from './pages/Login'

/**
 * With a cloud project, the store opens only once someone is signed in.
 * Without one, it opens once the person has chosen to keep it on this device.
 * Either way the login page is where they land first.
 */
function RequireAccount({ children }: { children: ReactNode }) {
  const state = useCloudSync((s) => s.state)
  const email = useCloudSync((s) => s.email)
  const localOnly = useCloudSync((s) => s.localOnly)
  const location = useLocation()

  if (state === 'starting') return <Splash />
  const open = state === 'off' ? localOnly : email !== null
  if (!open) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return children
}

export default function App() {
  useAppliedTheme()

  return (
    // Hash routing keeps deep links working when the build is dropped into
    // htdocs without an Apache rewrite rule.
    <HashRouter>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route
          element={
            <RequireAccount>
              <AppLayout />
            </RequireAccount>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="credit" element={<Credit />} />
          <Route path="parking" element={<Parking />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="sales" element={<Sales />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </HashRouter>
  )
}
