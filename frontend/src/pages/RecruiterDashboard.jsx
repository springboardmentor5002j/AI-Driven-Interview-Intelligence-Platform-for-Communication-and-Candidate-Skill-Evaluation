import { useState, useEffect } from 'react'
import { getCandidateReports } from '../api.js'

function RecruiterDashboard({ user, onLogout }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    getCandidateReports()
      .then(setReports)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="app-shell">
      <nav className="navbar">
        <span className="brand">SmartHire AI</span>
        <div className="nav-right">
          <span className="role-badge">Recruiter</span>
          <button className="link-btn" onClick={onLogout}>Log out</button>
        </div>
      </nav>
      <div className="content">
        <div className="panel wide-panel">
          <h2>Candidate Reports</h2>
          <p className="subtitle">Ranked by overall interview score, highest first.</p>

          {loading && <p className="subtitle">Loading...</p>}
          {error && <div className="error-banner">{error}</div>}
          {!loading && reports.length === 0 && !error && (
            <p className="subtitle">No completed interviews yet.</p>
          )}

          {reports.length > 0 && (
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Candidate</th>
                  <th>Overall</th>
                  <th>Comm.</th>
                  <th>Conf.</th>
                  <th>Tech.</th>
                  <th>Prof.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r, i) => (
                  <>
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td>
                        <strong>{r.candidate_name}</strong>
                        <div className="cell-sub">{r.candidate_email}</div>
                      </td>
                      <td><strong>{r.overall_score}</strong></td>
                      <td>{r.communication}</td>
                      <td>{r.confidence}</td>
                      <td>{r.technical}</td>
                      <td>{r.professionalism}</td>
                      <td>
                        <button
                          className="link-btn"
                          onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                        >
                          {expandedId === r.id ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === r.id && (
                      <tr key={`${r.id}-details`}>
                        <td colSpan={8}>
                          <div className="result-box">
                            <p><strong>Strengths:</strong> {r.strengths}</p>
                            <p><strong>Areas to improve:</strong> {r.improvements}</p>
                            <p style={{ marginTop: '10px' }}><strong>Transcript:</strong></p>
                            {r.history.map((h, j) => (
                              <p key={j}>
                                <strong>Q{j + 1}:</strong> {h.question}<br />
                                <strong>A:</strong> {h.answer}
                              </p>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default RecruiterDashboard