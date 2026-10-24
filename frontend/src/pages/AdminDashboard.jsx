function AdminDashboard({ user, onLogout }) {
  return (
    <div className="app-shell">
      <nav className="navbar">
        <span className="brand">SmartHire AI</span>
        <div className="nav-right">
          <span className="role-badge">Admin</span>
          <button className="link-btn" onClick={onLogout}>Log out</button>
        </div>
      </nav>
      <div className="content">
        <div className="panel">
          <h2>Welcome, {user.full_name || user.email}</h2>
          <p className="subtitle">User management and system settings will appear here.</p>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard