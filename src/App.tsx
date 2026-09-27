import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { Toaster } from './components/ui/Toast'
import { Dashboard } from './pages/Dashboard'
import { Credit } from './pages/Credit'
import { Parking } from './pages/Parking'
import { Inventory } from './pages/Inventory'
import { Sales } from './pages/Sales'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'

export default function App() {
  return (
    // Hash routing keeps deep links working when the build is dropped into
    // htdocs without an Apache rewrite rule.
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
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
