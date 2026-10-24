import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { getMyHistory } from '../api.js'

function downloadReport(entry, user) {
  const lines = [
    'SmartHire AI — Interview Report',
    '================================',
    `Candidate: ${user.full_name || user.email}`,
    `Date: ${new Date(entry.created_at).toLocaleString()}`,
    `Round: ${entry.round_type || 'technical'}`,
    `Difficulty: ${entry.difficulty}`,
    '',
    `Overall Score: ${entry.overall_score}/100`,
    `Communication (30%): ${entry.communication}/100`,
    `Confidence (25%): ${entry.confidence}/100`,
    `Technical Relevance (30%): ${entry.technical}/100`,
    `Professionalism (15%): ${entry.professionalism}/100`,
    '',
    `Strengths: ${entry.strengths}`,
    `Areas to Improve: ${entry.improvements}`,
    '',
    'Transcript',
    '----------',
    ...entry.history.flatMap((h, i) => [`Q${i + 1}: ${h.question}`, `A: ${h.answer}`, '']),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `interview-report-${entry.id}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

function CandidateProgress({ user }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getMyHistory()
      .then(setHistory)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="content"><p className="subtitle">Loading your progress...</p></div>
  if (error) return <div className="content"><div className="error-banner">{error}</div></div>

  const trendData = history.map((h, i) => ({
    name: `#${i + 1}`,
    score: h.overall_score,
  }))

  const latest = history[history.length - 1]
  const breakdownData = latest
    ? [
        { name: 'Communication', value: latest.communication },
        { name: 'Confidence', value: latest.confidence },
        { name: 'Technical', value: latest.technical },
        { name: 'Professionalism', value: latest.professionalism },
      ]
    : []

  return (
    <div className="dashboard-grid">
      <div className="panel full-width">
        <h2>Your Profile</h2>
        <p><strong>Name:</strong> {user.full_name || '—'}</p>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Role:</strong> {user.role}</p>
      </div>

      {history.length === 0 && (
        <div className="panel full-width">
          <p className="subtitle">You haven't completed any interviews yet. Finish one to see your progress here.</p>
        </div>
      )}

      {history.length > 0 && (
        <>
          <div className="panel">
            <h2>Score Trend</h2>
            <p className="subtitle">Your overall score across past interviews.</p>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E1D8" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#1F3A5F" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="panel">
            <h2>Latest Score Breakdown</h2>
            <p className="subtitle">{latest.round_type || 'technical'} · {latest.difficulty}</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={breakdownData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E1D8" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="value" fill="#2E7D6B" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="panel full-width">
            <h2>Past Interviews</h2>
            {history.slice().reverse().map((h) => (
              <div className="question-card" key={h.id} style={{ alignItems: 'center' }}>
                <span className="question-number">{h.overall_score}</span>
                <div style={{ flex: 1 }}>
                  <p>
                    <strong>{new Date(h.created_at).toLocaleDateString()}</strong>
                    {' · '}{h.round_type || 'technical'}{' · '}{h.difficulty}
                  </p>
                  <p style={{ fontSize: '13px', color: '#5B6577' }}>
                    Comm {h.communication} · Conf {h.confidence} · Tech {h.technical} · Prof {h.professionalism}
                  </p>
                </div>
                <button className="link-btn" onClick={() => downloadReport(h, user)}>Download</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default CandidateProgress