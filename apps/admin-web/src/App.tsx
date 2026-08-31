import { Routes, Route } from 'react-router-dom'
import { Shell } from './components/Shell'
import { Dashboard } from './pages/Dashboard'
import { Users } from './pages/Users'
import { Content } from './pages/Content'
import { AdminAuth } from './pages/AdminAuth'
import { Support } from './pages/Support'

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AdminAuth />} />
      <Route path="/" element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="content" element={<Content />} />
        <Route path="support" element={<Support />} />
      </Route>
    </Routes>
  )
}
