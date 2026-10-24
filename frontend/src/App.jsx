import { useState, useEffect } from 'react'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import CandidateDashboard from './pages/CandidateDashboard.jsx'
import RecruiterDashboard from './pages/RecruiterDashboard.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import { getMe } from './api.js'
import Landing from './pages/Landing.jsx'

function App() {
  const [screen, setScreen] = useState('landing') // 'landing' | 'login' | 'signup'
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On page load, check if a token already exists and is valid
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setLoading(false); return }
    getMe()
      .then((data) => setUser(data))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false))
  }, [])

  async function handleLoginSuccess() {
    const data = await getMe()
    setUser(data)
  }

  function handleLogout() {
    localStorage.removeItem('token')
    setUser(null)
    setScreen('login')
  }

  if (loading) return null

  if (user) {
    if (user.role === 'candidate') return <CandidateDashboard user={user} onLogout={handleLogout} />
    if (user.role === 'recruiter') return <RecruiterDashboard user={user} onLogout={handleLogout} />
    if (user.role === 'admin') return <AdminDashboard user={user} onLogout={handleLogout} />
  }

if (screen === 'landing') {
  return <Landing onGetStarted={() => setScreen('login')} />
}

return screen === 'login' ? (
  <Login onLoginSuccess={handleLoginSuccess} onSwitchToSignup={() => setScreen('signup')} />
) : (
  <Signup onSignupSuccess={() => setScreen('login')} onSwitchToLogin={() => setScreen('login')} />
)
}

export default App