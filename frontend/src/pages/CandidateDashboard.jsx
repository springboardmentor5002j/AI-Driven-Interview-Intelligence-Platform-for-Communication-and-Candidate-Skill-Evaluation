import { useState } from 'react'
import { uploadResume, generateInterview } from '../api.js'
import LiveInterview from './LiveInterview.jsx'
import CandidateProgress from './CandidateProgress.jsx'

const LEVELS = ['easy', 'medium', 'hard']
const ROUNDS = ['hr', 'behavioral', 'technical', 'aptitude']

function CandidateDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('practice') // 'practice' | 'progress'

  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState(null)
  const [questions, setQuestions] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [inLiveInterview, setInLiveInterview] = useState(false)
  const [difficulty, setDifficulty] = useState('medium')
  const [roundType, setRoundType] = useState('technical')

  async function handleUpload(e) {
    e.preventDefault()
    if (!file) return
    setStatus('Uploading and analyzing...')
    setResult(null)
    setQuestions(null)
    try {
      const data = await uploadResume(file)
      setResult(data)
      setStatus('Done!')
    } catch (err) {
      setStatus(err.message)
    }
  }

  async function handleGenerateQuestions() {
    setGenerating(true)
    try {
      const data = await generateInterview(result.id, difficulty, roundType)
      setQuestions(data.questions)
    } catch (err) {
      setStatus(err.message)
    } finally {
      setGenerating(false)
    }
  }

  if (inLiveInterview) {
    return (
      <LiveInterview
        skills={result.extracted_skills}
        firstQuestion={questions[0]}
        difficulty={difficulty}
        roundType={roundType}
        onExit={() => setInLiveInterview(false)}
      />
    )
  }

  return (
    <div className="app-shell">
      <nav className="navbar">
        <span className="brand">SmartHire AI</span>
        <div className="tab-row">
          <button className={`tab-btn ${activeTab === 'practice' ? 'active' : ''}`} onClick={() => setActiveTab('practice')}>Practice</button>
          <button className={`tab-btn ${activeTab === 'progress' ? 'active' : ''}`} onClick={() => setActiveTab('progress')}>My Progress</button>
        </div>
        <div className="nav-right">
          <span className="role-badge">Candidate</span>
          <button className="link-btn" onClick={onLogout}>Log out</button>
        </div>
      </nav>

      <div className="content">
        {activeTab === 'practice' ? (
          <div className="panel">
            <h2>Welcome, {user.full_name || user.email}</h2>
            <p className="subtitle">
              Upload your resume to get started with AI-generated interview questions.
            </p>

            <form onSubmit={handleUpload}>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setFile(e.target.files[0])}
                required
              />
              <button type="submit">Upload Resume</button>
            </form>

            {status && <p className="subtitle">{status}</p>}

            {result && (
              <div className="result-box">
                <p><strong>Skills:</strong> {result.extracted_skills}</p>
                <p><strong>Summary:</strong> {result.summary}</p>

                <p style={{ marginTop: '14px' }}><strong>Choose round:</strong></p>
                <div className="difficulty-row">
                  {ROUNDS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`diff-btn ${roundType === r ? 'active' : ''}`}
                      onClick={() => setRoundType(r)}
                    >
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>

                <p style={{ marginTop: '14px' }}><strong>Choose difficulty:</strong></p>
                <div className="difficulty-row">
                  {LEVELS.map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      className={`diff-btn ${difficulty === lvl ? 'active' : ''}`}
                      onClick={() => setDifficulty(lvl)}
                    >
                      {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                    </button>
                  ))}
                </div>

                <button
                  className="generate-btn"
                  onClick={handleGenerateQuestions}
                  disabled={generating}
                >
                  {generating ? 'Generating questions...' : '✨ Generate Interview Questions'}
                </button>
              </div>
            )}

            {questions && questions.length > 0 && (
              <div className="questions-section">
                <h3>Your {roundType} Questions ({difficulty})</h3>
                {questions.map((q, i) => (
                  <div className="question-card" key={i}>
                    <span className="question-number">{i + 1}</span>
                    <p>{q}</p>
                  </div>
                ))}
                <button
                  className="generate-btn"
                  onClick={() => setInLiveInterview(true)}
                  style={{ marginTop: '16px' }}
                >
                  🎙️ Start Live Voice Interview
                </button>
              </div>
            )}

            {questions && questions.length === 0 && (
              <div className="error-banner" style={{ marginTop: '16px' }}>
                Couldn't generate questions. Try again, or upload a resume with more detail.
              </div>
            )}
          </div>
        ) : (
          <CandidateProgress user={user} />
        )}
      </div>
    </div>
  )
}

export default CandidateDashboard